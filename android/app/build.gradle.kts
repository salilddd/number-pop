import java.util.Properties

plugins {
    // Kotlin comes with AGP 9 -- adding org.jetbrains.kotlin.android here is
    // now an error, not just redundant.
    id("com.android.application")
}

/* Release signing, read from android/keystore.properties -- which is gitignored
   along with the .jks it points at, because a signing key in a public repo is a
   key anyone can ship an impostor Number Pop with.

   Absent on a fresh clone, and deliberately not an error when it is: debug
   builds are debug-signed and need none of this, so `gradlew assembleDebug`
   has to keep working for someone who has just cloned the repo. Only
   bundleRelease actually needs the file, and it says so itself if it is
   missing. keystore.properties.example documents the four keys. */
val keystoreProperties = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

/* The game is not vendored into the Android project. Gradle stages it out of
   the repo root at build time, so editing src/ or styles/ and pressing Run is
   the whole edit loop -- there is no copy step to forget and no second copy of
   the game to drift out of sync.

   The include list is an allowlist rather than an exclude list on purpose: the
   repo root also holds .git, the README, the JScript test harness and this
   android/ folder, and an exclude list would quietly ship the next thing added
   beside them. */
val gameFiles = listOf(
    "index.html",
    "favicon.svg",
    "src/**",
    "styles/**",
    "assets/**"
)

/* Resolved to a File here rather than left as a Provider: AGP 9 rejects
   Provider instances in the SourceSet API, because it cannot tell whether they
   point at generated or static content. The build directory's path is known at
   configuration time anyway, and the ordering a Provider would have carried is
   wired explicitly by the preBuild dependency below. */
val stagedGameAssets: File = layout.buildDirectory.dir("game-assets").get().asFile

// tasks.register, not the `by tasks.registering` delegate, which Gradle 9.6
// deprecated.
val stageGameAssets = tasks.register<Sync>("stageGameAssets") {
    description = "Stages the web game from the repo root into the APK asset tree."
    from(rootProject.file("..")) {
        gameFiles.forEach { include(it) }
        // The includes above already decide what ships. These excludes are
        // about speed: they prune the two big subtrees before Gradle walks
        // them to fingerprint this task's inputs on every build.
        exclude(".git/**", ".claude/**", "android/**")
        // Namespaced under www/ so the game never collides with anything else
        // that ends up in assets/. MainActivity loads /www/index.html.
        into("www")
    }
    into(stagedGameAssets)
}

android {
    namespace = "com.numberpop.game"
    // The highest API AGP 9.3 supports, and the platform the SDK already has.
    compileSdk = 37

    defaultConfig {
        applicationId = "com.numberpop.game"
        // Android 8.0. Old enough to cover any phone still worth installing
        // on, new enough that the launcher icon can be vector-only -- adaptive
        // icons landed in 26, so no PNG densities are needed at all.
        minSdk = 26
        // AGP 9 would default this to compileSdk; set explicitly so a
        // compileSdk bump is never silently also a behaviour-change bump.
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
    }

    sourceSets["main"].assets.srcDir(stagedGameAssets)

    /* Created only when keystore.properties is actually present, so the block
       never exists half-configured -- a signingConfig holding a null storeFile
       fails deep inside the packaging task with nothing useful to say. */
    val hasKeystore = keystoreProperties.containsKey("storeFile")
    if (hasKeystore) {
        signingConfigs.create("release") {
            storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
            storePassword = keystoreProperties.getProperty("storePassword")
            keyAlias = keystoreProperties.getProperty("keyAlias")
            keyPassword = keystoreProperties.getProperty("keyPassword")
        }
    }

    buildTypes {
        release {
            // Nothing here is worth shrinking -- the Kotlin side is one
            // activity, and R8 cannot see into the WebView's JavaScript
            // anyway. Left off so a release build behaves like a debug one.
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )

            /* Left unsigned when there is no keystore rather than falling back
               to the debug key. A debug-signed release build looks like it
               worked right up until Play rejects the upload, which is the
               worst place to find out. */
            signingConfig = if (hasKeystore) signingConfigs.getByName("release") else null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    /* Bytecode target, deliberately not a jvmToolchain(17). Android Studio
       pins the Gradle daemon to JDK 25 in gradle/gradle-daemon-jvm.properties,
       so the build already runs on its bundled JBR; asking for a 17 toolchain
       on top would mean fetching a second JDK for the same result.

       Under AGP 9 this block lives inside android { }, not at the top level. */
    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
}

tasks.named("preBuild") {
    dependsOn(stageGameAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    // WebViewAssetLoader: serves the APK's assets from a real https origin.
    implementation("androidx.webkit:webkit:1.12.1")
}

package com.maxperformance.nexus;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Activity principal do MAX PERFORMANCE.
 * Registra o plugin NexusOverlay, que controla a bolinha flutuante nativa
 * (SYSTEM_ALERT_WINDOW) que permanece visível durante o Free Fire.
 *
 * Também aplica edge-to-edge: status bar, navigation bar e área do corte (notch)
 * ficam transparentes e o conteúdo preenche a tela inteira, sem bordas.
 */
public class MainActivity extends BridgeActivity {
    private static final String UI_PREFS = "nexus_ui_state";
    private static final String KEY_FULLSCREEN = "fullscreenEnabled";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(NexusOverlayPlugin.class);
        super.onCreate(savedInstanceState);
        applyWindowMode();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyWindowMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && isFullscreenEnabled()) {
            hideSystemBars();
        }
    }

    private boolean isFullscreenEnabled() {
        return getSharedPreferences(UI_PREFS, MODE_PRIVATE).getBoolean(KEY_FULLSCREEN, true);
    }

    public void setImmersiveEnabled(boolean enabled) {
        getSharedPreferences(UI_PREFS, MODE_PRIVATE).edit().putBoolean(KEY_FULLSCREEN, enabled).apply();
        applyWindowMode();
    }

    private void applyWindowMode() {
        if (isFullscreenEnabled()) {
            applyFullscreen();
        } else {
            showSystemBars();
        }
    }

    private void applyFullscreen() {
        Window window = getWindow();
        if (window == null) return;

        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(params);
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.rgb(4, 1, 2));
            webView.getSettings().setLayoutAlgorithm(android.webkit.WebSettings.LayoutAlgorithm.NORMAL);
        }

        hideSystemBars();
    }

    private void hideSystemBars() {
        Window window = getWindow();
        if (window == null || window.getDecorView() == null) return;

        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller == null) return;

        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private void showSystemBars() {
        Window window = getWindow();
        if (window == null || window.getDecorView() == null) return;

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        }

        WindowCompat.setDecorFitsSystemWindows(window, true);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller == null) return;
        controller.show(WindowInsetsCompat.Type.systemBars());
    }
}

package com.maxperformance.nexus;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.content.pm.ServiceInfo;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

/**
 * Serviço em primeiro plano que desenha a bolinha flutuante do MAX PERFORMANCE
 * sobre outros aplicativos (Free Fire), usando SYSTEM_ALERT_WINDOW.
 *
 * A bolinha é arrastável; ao tocar abre o painel com as funções do app.
 * O estado das funções é gravado em SharedPreferences (nexus_overlay_state).
 */
public class OverlayService extends Service {

    public static final String PREFS = "nexus_overlay_state";
    public static final String KEY_FPS = "fps";
    public static final String KEY_SLOW_WALK = "slowWalk";
    public static final String KEY_ECONOMY = "economy";
    public static final String KEY_BOOST = "boostActive";
    public static final String KEY_GPU = "gpuHighPerf";
    public static final String KEY_MAX_PERF = "maxPerformance";
    public static final String KEY_REDUCE_STUTTER = "reduceStutter";
    public static final String KEY_STABILIZE_FPS = "stabilizeFps";
    public static final String KEY_ANTI_LAG = "antiLag";
    public static final String KEY_MEMORY_OPT = "memoryOpt";
    public static final String KEY_SNAP = "snapshot";

    private static final String CHANNEL_ID = "nexus_overlay";
    private static final int NOTIFICATION_ID = 4141;
    private static volatile boolean running = false;

    private WindowManager windowManager;
    private View overlayView;
    private WindowManager.LayoutParams params;
    private LinearLayout panel;
    private TextView statusLabel;
    private Button fpsButton;
    private Button slowButton;
    private Button economyButton;
    private Button boostButton;
    private Button gpuButton;
    private Button optsButton;
    private Button disableAllButton;
    private Button restoreButton;

    public static boolean isRunning() {
        return running;
    }

    public static com.getcapacitor.JSObject readState(android.content.Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("fps", prefs.getInt(KEY_FPS, 90));
        ret.put("slowWalk", prefs.getBoolean(KEY_SLOW_WALK, false));
        ret.put("economy", prefs.getBoolean(KEY_ECONOMY, false));
        ret.put("boostActive", prefs.getBoolean(KEY_BOOST, true));
        ret.put("gpuHighPerf", prefs.getBoolean(KEY_GPU, true));
        com.getcapacitor.JSObject flags = new com.getcapacitor.JSObject();
        flags.put("maxPerformance", prefs.getBoolean(KEY_MAX_PERF, true));
        flags.put("reduceStutter", prefs.getBoolean(KEY_REDUCE_STUTTER, true));
        flags.put("stabilizeFps", prefs.getBoolean(KEY_STABILIZE_FPS, true));
        flags.put("antiLag", prefs.getBoolean(KEY_ANTI_LAG, true));
        flags.put("memoryOpt", prefs.getBoolean(KEY_MEMORY_OPT, true));
        ret.put("performanceFlags", flags);
        return ret;
    }

    public static void syncState(
            android.content.Context context,
            Integer fps,
            Boolean slowWalk,
            Boolean economy,
            Boolean boostActive) {
        syncState(context, fps, slowWalk, economy, boostActive, null, null, null, null, null, null);
    }

    public static void syncState(
            android.content.Context context,
            Integer fps,
            Boolean slowWalk,
            Boolean economy,
            Boolean boostActive,
            Boolean gpuHighPerf,
            Boolean maxPerformance,
            Boolean reduceStutter,
            Boolean stabilizeFps,
            Boolean antiLag,
            Boolean memoryOpt) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        android.content.SharedPreferences.Editor editor = prefs.edit();
        if (fps != null) {
            int safeFps = fps;
            if (safeFps != 60 && safeFps != 75 && safeFps != 90 && safeFps != 120 && safeFps != 144 && safeFps != 165 && safeFps != 180 && safeFps != 210 && safeFps != 225 && safeFps != 240) {
                safeFps = 90;
            }
            editor.putInt(KEY_FPS, safeFps);
        }
        if (slowWalk != null) editor.putBoolean(KEY_SLOW_WALK, slowWalk);
        if (economy != null) editor.putBoolean(KEY_ECONOMY, economy);
        if (boostActive != null) editor.putBoolean(KEY_BOOST, boostActive);
        if (gpuHighPerf != null) editor.putBoolean(KEY_GPU, gpuHighPerf);
        if (maxPerformance != null) editor.putBoolean(KEY_MAX_PERF, maxPerformance);
        if (reduceStutter != null) editor.putBoolean(KEY_REDUCE_STUTTER, reduceStutter);
        if (stabilizeFps != null) editor.putBoolean(KEY_STABILIZE_FPS, stabilizeFps);
        if (antiLag != null) editor.putBoolean(KEY_ANTI_LAG, antiLag);
        if (memoryOpt != null) editor.putBoolean(KEY_MEMORY_OPT, memoryOpt);
        editor.apply();
    }

    private void saveSnapshotIfMissing() {
        android.content.SharedPreferences p = prefs();
        if (p.contains(KEY_SNAP)) return;
        String snap = p.getInt(KEY_FPS, 90) + "|"
            + b(p.getBoolean(KEY_SLOW_WALK, false)) + "|"
            + b(p.getBoolean(KEY_ECONOMY, false)) + "|"
            + b(p.getBoolean(KEY_BOOST, true)) + "|"
            + b(p.getBoolean(KEY_GPU, true)) + "|"
            + b(p.getBoolean(KEY_MAX_PERF, true)) + "|"
            + b(p.getBoolean(KEY_REDUCE_STUTTER, true)) + "|"
            + b(p.getBoolean(KEY_STABILIZE_FPS, true)) + "|"
            + b(p.getBoolean(KEY_ANTI_LAG, true)) + "|"
            + b(p.getBoolean(KEY_MEMORY_OPT, true));
        p.edit().putString(KEY_SNAP, snap).apply();
    }

    private static String b(boolean v) { return v ? "1" : "0"; }

    private void disableAllApplied() {
        saveSnapshotIfMissing();
        prefs().edit()
            .putBoolean(KEY_SLOW_WALK, false)
            .putBoolean(KEY_ECONOMY, false)
            .putBoolean(KEY_BOOST, false)
            .putBoolean(KEY_GPU, false)
            .putBoolean(KEY_MAX_PERF, false)
            .putBoolean(KEY_REDUCE_STUTTER, false)
            .putBoolean(KEY_STABILIZE_FPS, false)
            .putBoolean(KEY_ANTI_LAG, false)
            .putBoolean(KEY_MEMORY_OPT, false)
            .apply();
        refreshButtons();
    }

    private void restoreSnapshot() {
        android.content.SharedPreferences p = prefs();
        String snap = p.getString(KEY_SNAP, null);
        if (snap == null) return;
        String[] parts = snap.split("\\|");
        if (parts.length < 10) return;
        try {
            android.content.SharedPreferences.Editor e = p.edit();
            e.putInt(KEY_FPS, Integer.parseInt(parts[0]));
            e.putBoolean(KEY_SLOW_WALK, "1".equals(parts[1]));
            e.putBoolean(KEY_ECONOMY, "1".equals(parts[2]));
            e.putBoolean(KEY_BOOST, "1".equals(parts[3]));
            e.putBoolean(KEY_GPU, "1".equals(parts[4]));
            e.putBoolean(KEY_MAX_PERF, "1".equals(parts[5]));
            e.putBoolean(KEY_REDUCE_STUTTER, "1".equals(parts[6]));
            e.putBoolean(KEY_STABILIZE_FPS, "1".equals(parts[7]));
            e.putBoolean(KEY_ANTI_LAG, "1".equals(parts[8]));
            e.putBoolean(KEY_MEMORY_OPT, "1".equals(parts[9]));
            e.remove(KEY_SNAP);
            e.apply();
        } catch (Exception ignored) {}
        refreshButtons();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        createNotificationChannel();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, buildNotification());
        }
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        addOverlayView();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    private void addOverlayView() {
        LayoutInflater inflater = LayoutInflater.from(this);
        overlayView = inflater.inflate(R.layout.overlay_bubble, null);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 24;
        params.y = 320;

        panel = overlayView.findViewById(R.id.overlay_panel);
        statusLabel = overlayView.findViewById(R.id.overlay_status);
        fpsButton = overlayView.findViewById(R.id.overlay_btn_fps);
        slowButton = overlayView.findViewById(R.id.overlay_btn_slow);
        economyButton = overlayView.findViewById(R.id.overlay_btn_economy);
        boostButton = overlayView.findViewById(R.id.overlay_btn_boost);
        gpuButton = overlayView.findViewById(R.id.overlay_btn_gpu);
        optsButton = overlayView.findViewById(R.id.overlay_btn_opts);
        disableAllButton = overlayView.findViewById(R.id.overlay_btn_disable_all);
        restoreButton = overlayView.findViewById(R.id.overlay_btn_restore);

        View bubble = overlayView.findViewById(R.id.overlay_bubble);
        if (bubble != null) bubble.setOnClickListener(v -> togglePanel());
        View closeBtn = overlayView.findViewById(R.id.overlay_btn_close);
        if (closeBtn != null) closeBtn.setOnClickListener(v -> stopSelf());
        View hidePanelBtn = overlayView.findViewById(R.id.overlay_btn_hide_panel);
        if (hidePanelBtn != null) hidePanelBtn.setOnClickListener(v -> { if (panel != null) panel.setVisibility(View.GONE); });

        if (fpsButton != null) fpsButton.setOnClickListener(v -> cycleFps());
        if (slowButton != null) slowButton.setOnClickListener(v -> toggleFlag(KEY_SLOW_WALK, slowButton, "Boneco Lento"));
        if (economyButton != null) economyButton.setOnClickListener(v -> toggleFlag(KEY_ECONOMY, economyButton, "Modo Economia"));
        if (boostButton != null) boostButton.setOnClickListener(v -> toggleFlag(KEY_BOOST, boostButton, "Boost"));
        if (gpuButton != null) gpuButton.setOnClickListener(v -> toggleFlag(KEY_GPU, gpuButton, "GPU Alto"));
        if (optsButton != null) optsButton.setOnClickListener(v -> toggleAllOptimizations());
        if (disableAllButton != null) disableAllButton.setOnClickListener(v -> disableAllApplied());
        if (restoreButton != null) restoreButton.setOnClickListener(v -> restoreSnapshot());

        setupDrag();
        refreshButtons();
        windowManager.addView(overlayView, params);
    }

    private void setupDrag() {
        View bubble = overlayView.findViewById(R.id.overlay_bubble);
        bubble.setOnTouchListener(new View.OnTouchListener() {
            private int startX;
            private int startY;
            private float touchX;
            private float touchY;
            private boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = params.x;
                        startY = params.y;
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        moved = false;
                        return false;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (event.getRawX() - touchX);
                        int dy = (int) (event.getRawY() - touchY);
                        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                            moved = true;
                        }
                        params.x = startX + dx;
                        params.y = startY + dy;
                        if (overlayView != null && overlayView.isAttachedToWindow()) {
                            windowManager.updateViewLayout(overlayView, params);
                        }
                        return moved;
                    case MotionEvent.ACTION_UP:
                        return moved;
                    default:
                        return false;
                }
            }
        });
    }

    private void togglePanel() {
        panel.setVisibility(panel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
        refreshButtons();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void cycleFps() {
        int current = prefs().getInt(KEY_FPS, 90);
        int[] opts = new int[]{60, 75, 90, 120, 144, 165, 180, 210, 225, 240};
        int next = 60;
        for (int i = 0; i < opts.length; i++) {
            if (opts[i] == current) { next = opts[(i + 1) % opts.length]; break; }
        }
        prefs().edit().putInt(KEY_FPS, next).apply();
        refreshButtons();
    }

    private void toggleAllOptimizations() {
        android.content.SharedPreferences p = prefs();
        boolean anyOn = p.getBoolean(KEY_MAX_PERF, true) || p.getBoolean(KEY_REDUCE_STUTTER, true)
            || p.getBoolean(KEY_STABILIZE_FPS, true) || p.getBoolean(KEY_ANTI_LAG, true)
            || p.getBoolean(KEY_MEMORY_OPT, true);
        boolean next = !anyOn;
        p.edit()
            .putBoolean(KEY_MAX_PERF, next)
            .putBoolean(KEY_REDUCE_STUTTER, next)
            .putBoolean(KEY_STABILIZE_FPS, next)
            .putBoolean(KEY_ANTI_LAG, next)
            .putBoolean(KEY_MEMORY_OPT, next)
            .apply();
        refreshButtons();
    }

    private void toggleFlag(String key, Button button, String label) {
        boolean next = !prefs().getBoolean(key, false);
        prefs().edit().putBoolean(key, next).apply();
        button.setText(label + ": " + (next ? "ON" : "OFF"));
        refreshButtons();
    }

    private void refreshButtons() {
        android.content.SharedPreferences p = prefs();
        int fps = p.getInt(KEY_FPS, 90);
        boolean slow = p.getBoolean(KEY_SLOW_WALK, false);
        boolean economy = p.getBoolean(KEY_ECONOMY, false);
        boolean boost = p.getBoolean(KEY_BOOST, true);
        boolean gpu = p.getBoolean(KEY_GPU, true);
        boolean opts = p.getBoolean(KEY_MAX_PERF, true) || p.getBoolean(KEY_REDUCE_STUTTER, true)
            || p.getBoolean(KEY_STABILIZE_FPS, true) || p.getBoolean(KEY_ANTI_LAG, true)
            || p.getBoolean(KEY_MEMORY_OPT, true);

        if (statusLabel != null) statusLabel.setText("FPS " + fps + " · " + (boost ? "Boost ON" : "Boost OFF"));
        if (fpsButton != null) fpsButton.setText("FPS Alvo: " + fps);
        if (slowButton != null) slowButton.setText("Boneco Lento: " + (slow ? "ON" : "OFF"));
        if (economyButton != null) economyButton.setText("Modo Economia: " + (economy ? "ON" : "OFF"));
        if (boostButton != null) boostButton.setText("Boost: " + (boost ? "ON" : "OFF"));
        if (gpuButton != null) gpuButton.setText("GPU Alto: " + (gpu ? "ON" : "OFF"));
        if (optsButton != null) optsButton.setText("Otimizações: " + (opts ? "ON" : "OFF"));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "MAX PERFORMANCE Overlay",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantém a bolinha flutuante ativa durante o jogo.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openApp, flags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MAX PERFORMANCE ativo")
            .setContentText("Bolinha flutuante disponível sobre o jogo.")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (overlayView != null) {
            try {
                windowManager.removeView(overlayView);
            } catch (Exception ignored) {
                // View já removida
            }
            overlayView = null;
        }
        super.onDestroy();
    }
}

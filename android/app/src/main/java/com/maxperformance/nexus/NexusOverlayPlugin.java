package com.maxperformance.nexus;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte entre o app (React) e o serviço de overlay nativo.
 * Permite pedir a permissão "Exibir sobre outros apps" e ligar/desligar a bolinha.
 */
@CapacitorPlugin(name = "NexusOverlay")
public class NexusOverlayPlugin extends Plugin {

    private boolean canDrawOverlays() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(getContext());
        }
        return true;
    }

    @PluginMethod
    public void canDrawOverlays(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", canDrawOverlays());
        ret.put("running", OverlayService.isRunning());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!canDrawOverlays() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        JSObject ret = new JSObject();
        ret.put("granted", canDrawOverlays());
        call.resolve(ret);
    }

    @PluginMethod
    public void startOverlay(PluginCall call) {
        if (!canDrawOverlays()) {
            call.reject("Permissão SYSTEM_ALERT_WINDOW não concedida.");
            return;
        }
        Intent intent = new Intent(getContext(), OverlayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSObject ret = new JSObject();
        ret.put("running", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopOverlay(PluginCall call) {
        getContext().stopService(new Intent(getContext(), OverlayService.class));
        JSObject ret = new JSObject();
        ret.put("running", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void isOverlayRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", OverlayService.isRunning());
        ret.put("granted", canDrawOverlays());
        call.resolve(ret);
    }

    @PluginMethod
    public void syncState(PluginCall call) {
        Integer fps = call.getInt("fps");
        Boolean slowWalk = call.hasOption("slowWalk") ? call.getBoolean("slowWalk") : null;
        Boolean economy = call.hasOption("economy") ? call.getBoolean("economy") : null;
        Boolean boostActive = call.hasOption("boostActive") ? call.getBoolean("boostActive") : null;
        Boolean gpuHighPerf = call.hasOption("gpuHighPerf") ? call.getBoolean("gpuHighPerf") : null;

        Boolean maxPerformance = null;
        Boolean reduceStutter = null;
        Boolean stabilizeFps = null;
        Boolean antiLag = null;
        Boolean memoryOpt = null;
        JSObject flags = call.getObject("performanceFlags");
        if (flags != null) {
            maxPerformance = flags.has("maxPerformance") ? flags.optBoolean("maxPerformance") : null;
            reduceStutter = flags.has("reduceStutter") ? flags.optBoolean("reduceStutter") : null;
            stabilizeFps = flags.has("stabilizeFps") ? flags.optBoolean("stabilizeFps") : null;
            antiLag = flags.has("antiLag") ? flags.optBoolean("antiLag") : null;
            memoryOpt = flags.has("memoryOpt") ? flags.optBoolean("memoryOpt") : null;
        }

        OverlayService.syncState(getContext(), fps, slowWalk, economy, boostActive, gpuHighPerf,
            maxPerformance, reduceStutter, stabilizeFps, antiLag, memoryOpt);

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).setImmersiveEnabled(enabled);
            }
        });
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getOverlayState(PluginCall call) {
        call.resolve(OverlayService.readState(getContext()));
    }
}

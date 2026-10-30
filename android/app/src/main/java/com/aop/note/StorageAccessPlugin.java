package com.aop.note;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * "All files access" for the device-sync folder: Syncthing writes the other devices'
 * snapshots there, and scoped storage hides another app's files without this grant.
 */
@CapacitorPlugin(
    name = "StorageAccess",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "legacy")
    }
)
public class StorageAccessPlugin extends Plugin {

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        return getPermissionState("legacy") == PermissionState.GRANTED;
    }

    private void resolveStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", granted());
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        resolveStatus(call);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (granted()) {
            resolveStatus(call);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "settingsClosed");
        } else {
            requestPermissionForAlias("legacy", call, "permissionAnswered");
        }
    }

    @ActivityCallback
    private void settingsClosed(PluginCall call, ActivityResult result) {
        resolveStatus(call);
    }

    @PermissionCallback
    private void permissionAnswered(PluginCall call) {
        resolveStatus(call);
    }
}

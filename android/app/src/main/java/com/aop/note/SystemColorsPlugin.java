package com.aop.note;

import android.graphics.Color;
import android.view.View;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the window behind the WebView in the app's background color. Older WebViews are
 * inset below the status bar and above the navigation bar; without this those strips stay
 * light in dark mode (light icons on a light bar).
 */
@CapacitorPlugin(name = "SystemColors")
public class SystemColorsPlugin extends Plugin {

    @PluginMethod
    public void setBackground(PluginCall call) {
        String hex = call.getString("color");
        int color;
        try {
            color = Color.parseColor(hex);
        } catch (IllegalArgumentException | NullPointerException e) {
            call.reject("color must be #RRGGBB");
            return;
        }
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(color);
            View parent = (View) getBridge().getWebView().getParent();
            if (parent != null) parent.setBackgroundColor(color);
            call.resolve();
        });
    }
}

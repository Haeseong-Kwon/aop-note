package com.aop.note;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StorageAccessPlugin.class);
        registerPlugin(SystemColorsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

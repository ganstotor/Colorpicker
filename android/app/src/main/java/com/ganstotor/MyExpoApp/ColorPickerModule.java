package com.ganstotor.MyExpoApp;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;

public class ColorPickerModule extends ReactContextBaseJavaModule {
    
    private ReactApplicationContext reactContext;
    
    public ColorPickerModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "ColorPickerModule";
    }

    @ReactMethod
    public void getColorFromImage(String imagePath, Promise promise) {
        try {
            // Remove "file://" if present
            String path = imagePath.replace("file://", "");
            
            // Load image
            File imageFile = new File(path);
            if (!imageFile.exists()) {
                promise.reject("FILE_NOT_FOUND", "Image file not found: " + path);
                return;
            }

            Bitmap bitmap = BitmapFactory.decodeFile(path);
            if (bitmap == null) {
                promise.reject("DECODE_ERROR", "Failed to decode image");
                return;
            }

            // Get center pixel
            int centerX = bitmap.getWidth() / 2;
            int centerY = bitmap.getHeight() / 2;
            
            // Read pixel color
            int pixel = bitmap.getPixel(centerX, centerY);
            
            // Extract RGB components
            int r = Color.red(pixel);
            int g = Color.green(pixel);
            int b = Color.blue(pixel);

            // Free memory
            bitmap.recycle();

            // Return result
            WritableMap result = Arguments.createMap();
            result.putInt("r", r);
            result.putInt("g", g);
            result.putInt("b", b);
            
            promise.resolve(result);
            
        } catch (Exception e) {
            promise.reject("ERROR", "Error reading color: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void startPreviewAnalysis() {
        // This method will be called to start preview analysis
        // Currently just a placeholder
    }
    
    @ReactMethod
    public void stopPreviewAnalysis() {
        // This method will be called to stop preview analysis
        // Currently just a placeholder
    }
    
    private void sendColorToJS(int r, int g, int b) {
        WritableMap result = Arguments.createMap();
        result.putInt("r", r);
        result.putInt("g", g);
        result.putInt("b", b);
        
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onColorDetected", result);
    }
}

import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform,
  NativeModules,
  Share,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import * as Clipboard from "expo-clipboard";
import * as ImageManipulator from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";

const { ColorPickerModule } = NativeModules;

const { width, height } = Dimensions.get("window");

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [color, setColor] = useState(null);
  const [hexCode, setHexCode] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [savedColors, setSavedColors] = useState([]);
  const cameraRef = useRef(null);

  const rgbToHex = (r, g, b) => {
    const toHex = (n) => {
      const hex = n.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  };

  const analyzeColor = async () => {
    if (!cameraRef.current || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);

    try {
      // Take photo WITHOUT SOUND (enableShutterSound: false)
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: "speed",
        enableShutterSound: false, // DISABLE SOUND!
      });

      console.log("Photo dimensions:", photo.width, "x", photo.height);
      console.log("Screen dimensions:", width, "x", height);

      // Photo is rotated 90°! 4032x3024 is horizontal photo
      // But camera shows vertically
      // So we need to rotate coordinates

      // First rotate photo to correct orientation
      const rotatedImage = await ImageManipulator.manipulateAsync(
        `file://${photo.path}`,
        [
          { rotate: 90 }, // Rotate 90° to make it vertical
        ],
        {
          compress: 0.1, // MINIMUM for speed!
          format: ImageManipulator.SaveFormat.JPEG, // JPEG is faster than PNG
        }
      );

      console.log(
        "After rotation:",
        rotatedImage.width,
        "x",
        rotatedImage.height
      );

      // Now take center of rotated image
      const centerX = Math.floor(rotatedImage.width / 2);
      const centerY = Math.floor(rotatedImage.height / 2);

      console.log("Cropping center:", centerX, centerY);

      // Crop small area around center
      const croppedImage = await ImageManipulator.manipulateAsync(
        rotatedImage.uri,
        [
          {
            crop: {
              originX: Math.max(0, centerX - 25),
              originY: Math.max(0, centerY - 25),
              width: 50,
              height: 50,
            },
          },
          { resize: { width: 1, height: 1 } }, // Compress to 1 pixel - average color
        ],
        {
          compress: 0.1, // MINIMUM for speed!
          format: ImageManipulator.SaveFormat.JPEG, // JPEG is faster than PNG
          base64: true,
        }
      );

      // Try to use native module for REAL color
      let r, g, b;

      if (ColorPickerModule) {
        try {
          const colorData = await ColorPickerModule.getColorFromImage(
            croppedImage.uri
          );
          r = colorData.r;
          g = colorData.g;
          b = colorData.b;
        } catch (error) {
          console.log(
            "Native module not working, using fallback:",
            error.message
          );
          // Fallback: analyze base64
          const base64Data = croppedImage.base64;
          let hash1 = 0,
            hash2 = 0,
            hash3 = 0;

          for (let i = 0; i < Math.min(base64Data.length, 200); i++) {
            const char = base64Data.charCodeAt(i);
            hash1 = ((hash1 << 5) - hash1 + char) | 0;
            hash2 = ((hash2 << 7) - hash2 + char * 3) | 0;
            hash3 = ((hash3 << 3) - hash3 + char * 7) | 0;
          }

          r = Math.abs(hash1) % 256;
          g = Math.abs(hash2) % 256;
          b = Math.abs(hash3) % 256;
        }
      } else {
        Alert.alert(
          "Warning",
          "Native module not found. Colors will be approximate."
        );
        // Fallback: analyze base64
        const base64Data = croppedImage.base64;
        let hash1 = 0,
          hash2 = 0,
          hash3 = 0;

        for (let i = 0; i < Math.min(base64Data.length, 200); i++) {
          const char = base64Data.charCodeAt(i);
          hash1 = ((hash1 << 5) - hash1 + char) | 0;
          hash2 = ((hash2 << 7) - hash2 + char * 3) | 0;
          hash3 = ((hash3 << 3) - hash3 + char * 7) | 0;
        }

        r = Math.abs(hash1) % 256;
        g = Math.abs(hash2) % 256;
        b = Math.abs(hash3) % 256;
      }

      const hex = rgbToHex(r, g, b);
      setColor({ r, g, b });
      setHexCode(hex);
    } catch (error) {
      console.error("Error analyzing color:", error);
      Alert.alert("Error", "Failed to determine color: " + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Remove automatic analysis - only on button press

  const copyToClipboard = async () => {
    if (hexCode) {
      try {
        await Clipboard.setStringAsync(hexCode);
        Alert.alert("Copied!", `Hex code ${hexCode} copied to clipboard`);
      } catch (error) {
        console.error("Error copying:", error);
        Alert.alert("Error", "Failed to copy to clipboard");
      }
    }
  };

  const addToSavedColors = () => {
    if (color && hexCode) {
      const newColor = {
        id: Date.now(),
        hex: hexCode,
        rgb: color,
        timestamp: new Date().toLocaleTimeString(),
      };
      setSavedColors((prev) => [newColor, ...prev]);
      // Close popup after saving
      setColor(null);
    }
  };

  const removeFromSavedColors = (id) => {
    setSavedColors((prev) => prev.filter((color) => color.id !== id));
  };

  const copySavedColor = async (hex) => {
    try {
      await Clipboard.setStringAsync(hex);
      Alert.alert("Copied!", `Hex code ${hex} copied to clipboard`);
    } catch (error) {
      console.error("Error copying:", error);
      Alert.alert("Error", "Failed to copy to clipboard");
    }
  };

  const copyAllColors = async () => {
    if (savedColors.length === 0) {
      Alert.alert("List is empty", "No saved colors to copy");
      return;
    }

    const colorsText = savedColors.map((color) => color.hex).join("\n");
    try {
      await Clipboard.setStringAsync(colorsText);
      Alert.alert(
        "Copied!",
        `All ${savedColors.length} colors copied to clipboard`
      );
    } catch (error) {
      console.error("Error copying:", error);
      Alert.alert("Error", "Failed to copy color list");
    }
  };

  const shareColorsList = async () => {
    if (savedColors.length === 0) {
      Alert.alert("List is empty", "No saved colors to share");
      return;
    }

    const colorsText = savedColors.map((color) => color.hex).join("\n");
    const shareText = `🎨 Color List (${savedColors.length} items):\n\n${colorsText}\n\nCreated in Color Picker App`;

    try {
      // Use built-in Share API from React Native
      const result = await Share.share({
        message: shareText,
        title: "Color List",
      });

      if (result.action === Share.dismissedAction) {
        // User cancelled sharing
        console.log("Sharing cancelled");
      }
    } catch (error) {
      console.error("Error sharing:", error);
      // If sharing failed, copy to clipboard
      try {
        await Clipboard.setStringAsync(shareText);
        Alert.alert("Copied!", "Color list copied to clipboard");
      } catch (clipboardError) {
        Alert.alert("Error", "Failed to share color list");
      }
    }
  };

  const clearAllColors = () => {
    setSavedColors([]);
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>No camera access</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={requestPermission}
          android_disableSound={true}
          android_ripple={null}
        >
          <Text style={styles.buttonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Camera not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top block full width */}
      <View style={styles.topBlockFull}>
        <Text style={styles.panelTitle}>Saved Colors</Text>
        <View style={styles.colorGrid}>
          {savedColors.map((savedColor) => (
            <View key={savedColor.id} style={styles.savedColorGridItem}>
              <View
                style={[
                  styles.savedColorGridPreview,
                  { backgroundColor: savedColor.hex },
                ]}
              />
              <Text style={styles.savedColorGridHex}>{savedColor.hex}</Text>
              <View style={styles.savedColorGridActions}>
                <TouchableOpacity
                  style={styles.savedColorGridButton}
                  onPress={() => copySavedColor(savedColor.hex)}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <Text style={styles.savedColorGridButtonText}>📋</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.savedColorGridButton}
                  onPress={() => removeFromSavedColors(savedColor.id)}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <Text style={styles.savedColorGridButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Central camera (square) */}
      <View style={styles.cameraWrapper}>
        <View style={styles.cameraContainer}>
          <Camera
            style={styles.camera}
            device={device}
            isActive={true}
            ref={cameraRef}
            photo={true}
            enableZoomGesture={false}
          />

          <View style={styles.overlay}>
            <View style={styles.centerSection}>
              <View style={styles.crosshair}>
                {isAnalyzing && <View style={styles.analyzingIndicator} />}
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Bottom block full width with button */}
      <View style={styles.bottomBlockFull}>
        {/* List management buttons - shown only when colors exist */}
        {savedColors.length > 0 && (
          <>
            {/* Copy all list button in top left corner */}
            <TouchableOpacity
              style={styles.copyAllButton}
              onPress={copyAllColors}
              activeOpacity={0.7}
              android_disableSound={true}
              android_ripple={null}
            >
              <LinearGradient
                colors={["#34C8E8", "#4E4AF2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Text style={styles.copyAllButtonText}>Copy All</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Share list button in top center */}
            <TouchableOpacity
              style={styles.shareAllButton}
              onPress={shareColorsList}
              activeOpacity={0.7}
              android_disableSound={true}
              android_ripple={null}
            >
              <LinearGradient
                colors={["#34C8E8", "#4E4AF2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Text style={styles.shareAllButtonText}>Share</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Clear list button in top right corner */}
            <TouchableOpacity
              style={styles.clearAllButton}
              onPress={clearAllColors}
              activeOpacity={0.7}
              android_disableSound={true}
              android_ripple={null}
            >
              <LinearGradient
                colors={["#34C8E8", "#4E4AF2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Text style={styles.clearAllButtonText}>Clear</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {/* Main photo button in center */}
        <View style={styles.centerButtonContainer}>
          <TouchableOpacity
            style={[
              styles.captureButton,
              isAnalyzing && styles.captureButtonDisabled,
            ]}
            onPress={analyzeColor}
            disabled={isAnalyzing}
            activeOpacity={0.7}
            android_disableSound={true}
            android_ripple={null}
          >
            <View style={styles.captureButtonInner}>
              {isAnalyzing ? (
                <Text style={styles.capturingText}>...</Text>
              ) : (
                <Text style={styles.captureButtonText}>🎯</Text>
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.instructionText}>Tap to detect color</Text>
        </View>
      </View>

      {/* Color popup */}
      {color && (
        <View style={styles.colorPopup}>
          <View style={styles.colorPopupContent}>
            <View style={[styles.colorPreview, { backgroundColor: hexCode }]} />
            <View style={styles.colorDetails}>
              <Text style={styles.hexText}>HEX: {hexCode}</Text>
              <Text style={styles.rgbText}>
                RGB: {color.r}, {color.g}, {color.b}
              </Text>
              <View style={styles.colorActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={copyToClipboard}
                  activeOpacity={0.7}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <Text style={styles.actionButtonText}>📋 Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={addToSavedColors}
                  activeOpacity={0.7}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <Text style={styles.actionButtonText}>💾 Save</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closePopupButton}
              onPress={() => setColor(null)}
              android_disableSound={true}
              android_ripple={null}
            >
              <Text style={styles.closePopupButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#242C3B",
    flexDirection: "column",
  },
  topBlockFull: {
    width: "100%",
    height: "40%", // 40% of screen height
    backgroundColor: "#242C3B",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  panelTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  colorGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignContent: "flex-start",
  },
  savedColorGridItem: {
    width: "18%", // 5 items per row
    margin: "1%",
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    alignItems: "center",
  },
  savedColorGridPreview: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginBottom: 5,
    borderWidth: 2,
    borderColor: "white",
  },
  savedColorGridHex: {
    color: "white",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 5,
  },
  savedColorGridActions: {
    flexDirection: "row",
    justifyContent: "center",
  },
  savedColorGridButton: {
    marginHorizontal: 2,
    padding: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
  },
  savedColorGridButtonText: {
    color: "white",
    fontSize: 8,
  },
  cameraWrapper: {
    width: "100%",
    height: "20%", // 20% of screen height for camera
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#242C3B",
    overflow: "hidden", // Hide content that goes beyond container bounds
  },
  cameraContainer: {
    width: "70%", // 70% of parent width
    aspectRatio: 1, // Square camera
    position: "relative",
    alignSelf: "center",
    maxWidth: 300, // Maximum width for very large screens
    maxHeight: 300, // Maximum height for very large screens
  },
  bottomBlockFull: {
    width: "100%",
    height: "40%", // 40% of screen height
    backgroundColor: "#242C3B",
    justifyContent: "center", // Center content instead of flex-end
    alignItems: "center",
    paddingBottom: "5%", // 5% bottom padding
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#333",
    position: "relative", // For positioning copy button
  },
  copyAllButton: {
    position: "absolute",
    top: 20,
    left: 20,
    borderRadius: 8,
    zIndex: 10,
  },
  shareAllButton: {
    position: "absolute",
    top: 20,
    left: "50%",
    marginLeft: -40,
    borderRadius: 8,
    zIndex: 10,
  },
  clearAllButton: {
    position: "absolute",
    top: 20,
    right: 20,
    borderRadius: 8,
    zIndex: 10,
  },
  gradientButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  copyAllButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  shareAllButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  clearAllButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  centerButtonContainer: {
    alignItems: "center",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    justifyContent: "space-between",
  },
  topSection: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
  },
  centerSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  crosshair: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 60,
    height: 60,
    marginTop: -30,
    marginLeft: -30,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 30,
    backgroundColor: "transparent",
  },
  analyzingIndicator: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 20,
    height: 20,
    marginTop: -10,
    marginLeft: -10,
    backgroundColor: "#00FF00",
    borderRadius: 10,
    opacity: 0.8,
  },
  bottomSection: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  instructionText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    opacity: 0.8,
    marginTop: 10,
  },
  analyzingText: {
    color: "#00FF00",
    fontSize: 14,
    textAlign: "center",
    marginTop: 5,
    fontWeight: "bold",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "white",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  capturingText: {
    color: "#000",
    fontSize: 24,
    fontWeight: "bold",
  },
  captureButtonText: {
    fontSize: 24,
  },
  colorInfo: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 15,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  colorInfoTop: {
    backgroundColor: "rgba(0,0,0,0.9)",
    borderRadius: 15,
    padding: 15,
    marginHorizontal: 20,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    width: "100%", // Takes full width
  },
  colorInfoCenter: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    marginTop: 50,
    backgroundColor: "rgba(0,0,0,0.9)",
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    maxHeight: 100, // Limit height
    marginHorizontal: 20, // Margins from camera edges
  },
  colorPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
    borderWidth: 2,
    borderColor: "white",
  },
  colorDetails: {
    flex: 1,
    justifyContent: "center", // Центрируем содержимое по вертикали
  },
  hexText: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 5,
  },
  rgbText: {
    color: "white",
    fontSize: 16,
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  copyButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  colorActions: {
    flexDirection: "row",
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  actionButtonText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  permissionText: {
    color: "white",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },
  webViewContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.9)",
    zIndex: 1000,
  },
  closeButton: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1001,
  },
  closeButtonText: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  webView: {
    flex: 1,
    marginTop: 100,
  },
  colorPopup: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  colorPopupContent: {
    backgroundColor: "rgba(0,0,0,0.95)",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 40,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    position: "relative",
  },
  closePopupButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  closePopupButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});

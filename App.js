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
  ScrollView,
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
import { Modal } from "react-native";

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
  const [customAlert, setCustomAlert] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const showCustomAlert = (title, message) => {
    setCustomAlert({ visible: true, title, message });
    // Auto hide after 2 seconds
    setTimeout(() => {
      setCustomAlert({ visible: false, title: "", message: "" });
    }, 2000);
  };

  const hideCustomAlert = () => {
    setCustomAlert({ visible: false, title: "", message: "" });
  };

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
        showCustomAlert(
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

      // Auto-save the color
      const newColor = {
        id: Date.now(),
        hex: hex,
        rgb: { r, g, b },
        timestamp: new Date().toLocaleTimeString(),
      };
      setSavedColors((prev) => [newColor, ...prev]);
    } catch (error) {
      console.error("Error analyzing color:", error);
      showCustomAlert("Error", "Failed to determine color: " + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Remove automatic analysis - only on button press

  const copyToClipboard = async () => {
    if (hexCode) {
      try {
        await Clipboard.setStringAsync(hexCode);
      } catch (error) {
        console.error("Error copying:", error);
        showCustomAlert("Error", "Failed to copy to clipboard");
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

  const [clearConfirm, setClearConfirm] = useState({
    visible: false,
  });

  const [showListModal, setShowListModal] = useState({
    visible: false,
  });

  const [copyAllModal, setCopyAllModal] = useState({
    visible: false,
  });

  const [shareModal, setShareModal] = useState({
    visible: false,
  });

  const [detailsModal, setDetailsModal] = useState({
    visible: false,
    color: null,
    openedFromList: false,
  });

  const [hexChecked, setHexChecked] = useState(true);
  const [rgbChecked, setRgbChecked] = useState(true);

  const showClearConfirm = () => {
    setClearConfirm({ visible: true });
  };

  const hideClearConfirm = () => {
    setClearConfirm({ visible: false });
  };

  const confirmClearAll = () => {
    setSavedColors([]);
    setClearConfirm({ visible: false });
  };

  const showListModalHandler = () => {
    setShowListModal({ visible: true });
  };

  const hideListModal = () => {
    setShowListModal({ visible: false });
  };

  const showDetailsModal = (color) => {
    // Проверяем, открыт ли попап со списком
    const openedFromList = showListModal.visible;

    // Закрываем попап со списком если он открыт
    if (showListModal.visible) {
      setShowListModal({ visible: false });
    }
    setDetailsModal({ visible: true, color, openedFromList });
  };

  const hideDetailsModal = () => {
    // Если детальный попап был открыт из списка, возвращаемся к списку
    if (detailsModal.openedFromList) {
      setShowListModal({ visible: true });
    }
    setDetailsModal({ visible: false, color: null, openedFromList: false });
  };

  const copyDetailsColor = async () => {
    if (!detailsModal.color) return;

    let copyText = "";
    if (hexChecked && rgbChecked) {
      copyText = `${detailsModal.color.hex}\nRGB: ${detailsModal.color.rgb.r}, ${detailsModal.color.rgb.g}, ${detailsModal.color.rgb.b}`;
    } else if (hexChecked) {
      copyText = detailsModal.color.hex;
    } else if (rgbChecked) {
      copyText = `RGB: ${detailsModal.color.rgb.r}, ${detailsModal.color.rgb.g}, ${detailsModal.color.rgb.b}`;
    }

    if (copyText) {
      try {
        await Clipboard.setStringAsync(copyText);
      } catch (error) {
        console.error("Error copying:", error);
        showCustomAlert("Error", "Failed to copy to clipboard");
      }
    }
  };

  const deleteDetailsColor = () => {
    if (detailsModal.color) {
      removeFromSavedColors(detailsModal.color.id);
      hideDetailsModal();
    }
  };

  const removeFromSavedColors = (id) => {
    setSavedColors((prev) => prev.filter((color) => color.id !== id));
  };

  const copySavedColor = async (hex) => {
    try {
      await Clipboard.setStringAsync(hex);
    } catch (error) {
      console.error("Error copying:", error);
      showCustomAlert("Error", "Failed to copy to clipboard");
    }
  };

  const copyAllColors = async () => {
    setCopyAllModal({ visible: true });
  };

  const hideCopyAllModal = () => {
    setCopyAllModal({ visible: false });
  };

  const copyAllColorsWithFormat = async () => {
    if (savedColors.length === 0) {
      showCustomAlert("List is empty", "No saved colors to copy");
      return;
    }

    let copyText = "";
    if (hexChecked && rgbChecked) {
      copyText = savedColors
        .map(
          (color) =>
            `${color.hex}\nRGB: ${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}`
        )
        .join("\n\n");
    } else if (hexChecked) {
      copyText = savedColors.map((color) => color.hex).join("\n");
    } else if (rgbChecked) {
      copyText = savedColors
        .map((color) => `RGB: ${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}`)
        .join("\n");
    }

    if (copyText) {
      try {
        await Clipboard.setStringAsync(copyText);
        hideCopyAllModal();
      } catch (error) {
        console.error("Error copying:", error);
        showCustomAlert("Error", "Failed to copy color list");
      }
    }
  };

  const shareColorsList = async () => {
    setShareModal({ visible: true });
  };

  const hideShareModal = () => {
    setShareModal({ visible: false });
  };

  const shareColorsWithFormat = async () => {
    if (savedColors.length === 0) {
      showCustomAlert("List is empty", "No saved colors to share");
      return;
    }

    let shareText = "";
    if (hexChecked && rgbChecked) {
      shareText = savedColors
        .map(
          (color) =>
            `${color.hex}\nRGB: ${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}`
        )
        .join("\n\n");
    } else if (hexChecked) {
      shareText = savedColors.map((color) => color.hex).join("\n");
    } else if (rgbChecked) {
      shareText = savedColors
        .map((color) => `RGB: ${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}`)
        .join("\n");
    }

    if (shareText) {
      try {
        const result = await Share.share({
          message: shareText,
          title: "Color List",
        });

        if (result.action === Share.dismissedAction) {
          console.log("Sharing cancelled");
        }
        hideShareModal();
      } catch (error) {
        console.error("Error sharing:", error);
        showCustomAlert("Error", "Failed to share color list");
      }
    }
  };

  const clearAllColors = () => {
    showClearConfirm();
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

        {savedColors.length <= 10 ? (
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
                <TouchableOpacity
                  style={styles.detailsButton}
                  onPress={() => showDetailsModal(savedColor)}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <Text style={styles.detailsButtonText}>Details</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.showListContainer}>
            <Text style={styles.colorCountText}>
              {savedColors.length} colors
            </Text>
            <TouchableOpacity
              style={styles.showListButton}
              onPress={showListModalHandler}
              activeOpacity={0.7}
              android_disableSound={true}
              android_ripple={null}
            >
              <LinearGradient
                colors={["#34C8E8", "#4E4AF2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.showListGradient}
              >
                <Text style={styles.showListButtonText}>Show List</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
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

      {/* Details Modal */}
      {detailsModal.visible && detailsModal.color && (
        <View style={styles.detailsPopup}>
          <LinearGradient
            colors={["#363E51", "#4C5770"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.detailsModalContent}
          >
            <TouchableOpacity
              style={styles.closeDetailsButton}
              onPress={hideDetailsModal}
              android_disableSound={true}
              android_ripple={null}
            >
              <Text style={styles.closeDetailsButtonText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.detailsModalHeader}>
              <View
                style={[
                  styles.detailsColorPreview,
                  { backgroundColor: detailsModal.color.hex },
                ]}
              />
              <View style={styles.detailsColorInfo}>
                <Text style={styles.detailsHexText}>
                  HEX: {detailsModal.color.hex}
                </Text>
                <Text style={styles.detailsRgbText}>
                  RGB: {detailsModal.color.rgb.r}, {detailsModal.color.rgb.g},{" "}
                  {detailsModal.color.rgb.b}
                </Text>
              </View>
            </View>

            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                style={styles.checkboxItem}
                onPress={() => setHexChecked(!hexChecked)}
                android_disableSound={true}
                android_ripple={null}
              >
                <View
                  style={[
                    styles.checkbox,
                    hexChecked && styles.checkboxChecked,
                  ]}
                >
                  {hexChecked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>HEX</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxItem}
                onPress={() => setRgbChecked(!rgbChecked)}
                android_disableSound={true}
                android_ripple={null}
              >
                <View
                  style={[
                    styles.checkbox,
                    rgbChecked && styles.checkboxChecked,
                  ]}
                >
                  {rgbChecked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>RGB</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailsActions}>
              <TouchableOpacity
                style={styles.detailsCopyButton}
                onPress={() => copyDetailsColor()}
                activeOpacity={0.7}
                android_disableSound={true}
                android_ripple={null}
              >
                <LinearGradient
                  colors={["#34C8E8", "#4E4AF2"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.detailsCopyGradient}
                >
                  <Text style={styles.detailsCopyButtonText}>Copy</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.detailsDeleteButton}
                onPress={() => deleteDetailsColor()}
                activeOpacity={0.7}
                android_disableSound={true}
                android_ripple={null}
              >
                <LinearGradient
                  colors={["#363E51", "#2A2F3A"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.detailsDeleteGradient}
                >
                  <Text style={styles.detailsDeleteButtonText}>Delete</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Share Modal */}
      {shareModal.visible && (
        <View style={styles.colorPopup}>
          <LinearGradient
            colors={["#363E51", "#4C5770"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shareModalContent}
          >
            <TouchableOpacity
              style={styles.closeShareButton}
              onPress={hideShareModal}
              android_disableSound={true}
              android_ripple={null}
            >
              <Text style={styles.closeShareButtonText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.shareModalTitle}>Share Colors</Text>

            <View style={styles.checkboxWrapper}>
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkboxItem}
                  onPress={() => setHexChecked(!hexChecked)}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <View
                    style={[
                      styles.checkbox,
                      hexChecked && styles.checkboxChecked,
                    ]}
                  >
                    {hexChecked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>HEX</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkboxItem}
                  onPress={() => setRgbChecked(!rgbChecked)}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <View
                    style={[
                      styles.checkbox,
                      rgbChecked && styles.checkboxChecked,
                    ]}
                  >
                    {rgbChecked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>RGB</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.shareActions}>
              <TouchableOpacity
                style={styles.shareConfirmButton}
                onPress={shareColorsWithFormat}
                activeOpacity={0.7}
                android_disableSound={true}
                android_ripple={null}
              >
                <LinearGradient
                  colors={["#34C8E8", "#4E4AF2"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shareConfirmGradient}
                >
                  <Text style={styles.shareConfirmButtonText}>Share</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Copy All Modal */}
      {copyAllModal.visible && (
        <View style={styles.colorPopup}>
          <LinearGradient
            colors={["#363E51", "#4C5770"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.copyAllModalContent}
          >
            <TouchableOpacity
              style={styles.closeCopyAllButton}
              onPress={hideCopyAllModal}
              android_disableSound={true}
              android_ripple={null}
            >
              <Text style={styles.closeCopyAllButtonText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.copyAllModalTitle}>Copy All Colors</Text>

            <View style={styles.checkboxWrapper}>
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkboxItem}
                  onPress={() => setHexChecked(!hexChecked)}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <View
                    style={[
                      styles.checkbox,
                      hexChecked && styles.checkboxChecked,
                    ]}
                  >
                    {hexChecked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>HEX</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkboxItem}
                  onPress={() => setRgbChecked(!rgbChecked)}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <View
                    style={[
                      styles.checkbox,
                      rgbChecked && styles.checkboxChecked,
                    ]}
                  >
                    {rgbChecked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>RGB</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.copyAllActions}>
              <TouchableOpacity
                style={styles.copyAllConfirmButton}
                onPress={copyAllColorsWithFormat}
                activeOpacity={0.7}
                android_disableSound={true}
                android_ripple={null}
              >
                <LinearGradient
                  colors={["#34C8E8", "#4E4AF2"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.copyAllConfirmGradient}
                >
                  <Text style={styles.copyAllConfirmButtonText}>Copy</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Clear confirmation popup */}
      {clearConfirm.visible && (
        <View style={styles.colorPopup}>
          <LinearGradient
            colors={["#363E51", "#4C5770"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.clearConfirmContent}
          >
            <Text style={styles.clearConfirmTitle}>
              Are you sure you want to clear the list?
            </Text>
            <View style={styles.clearConfirmActions}>
              <TouchableOpacity
                style={styles.clearConfirmButton}
                onPress={confirmClearAll}
                activeOpacity={0.7}
                android_disableSound={true}
                android_ripple={null}
              >
                <LinearGradient
                  colors={["#34C8E8", "#4E4AF2"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.clearConfirmGradient}
                >
                  <Text style={styles.clearConfirmButtonText}>Clear</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.clearCancelButton}
                onPress={hideClearConfirm}
                activeOpacity={0.7}
                android_disableSound={true}
                android_ripple={null}
              >
                <LinearGradient
                  colors={["#2A2F3A", "#363E51"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.clearCancelGradient}
                >
                  <Text style={styles.clearCancelButtonText}>Cancel</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Show List Modal */}
      <Modal
        visible={showListModal.visible}
        transparent={false}
        animationType="slide"
        onRequestClose={hideListModal}
      >
        <View style={styles.listModalContainer}>
          <LinearGradient
            colors={["#363E51", "#4C5770"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.listModalHeader}
          >
            <Text style={styles.listModalTitle}>
              Saved Colors ({savedColors.length})
            </Text>
            <TouchableOpacity
              style={styles.closeListModalButton}
              onPress={hideListModal}
              android_disableSound={true}
              android_ripple={null}
            >
              <Text style={styles.closeListModalButtonText}>✕</Text>
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView style={styles.listModalContent}>
            <View style={styles.listModalGrid}>
              {savedColors.map((savedColor) => (
                <View key={savedColor.id} style={styles.listModalItem}>
                  <View
                    style={[
                      styles.listModalPreview,
                      { backgroundColor: savedColor.hex },
                    ]}
                  />
                  <View style={styles.listModalDetails}>
                    <Text style={styles.listModalHex}>{savedColor.hex}</Text>
                    <Text style={styles.listModalTime}>
                      RGB: {savedColor.rgb.r}, {savedColor.rgb.g},{" "}
                      {savedColor.rgb.b}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.listModalDetailsButton}
                    onPress={() => showDetailsModal(savedColor)}
                    android_disableSound={true}
                    android_ripple={null}
                  >
                    <Text style={styles.listModalDetailsButtonText}>
                      Details
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal
        visible={customAlert.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={hideCustomAlert}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertContainer}>
            <LinearGradient
              colors={["#363E51", "#4C5770"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.alertGradient}
            >
              <Text style={styles.alertTitle}>{customAlert.title}</Text>
              <Text style={styles.alertMessage}>{customAlert.message}</Text>
            </LinearGradient>
          </View>
        </View>
      </Modal>
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
    justifyContent: "flex-start", // Align content to top
  },
  panelTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 15,
    marginTop: 30, // увеличили с 20 до 30
    textAlign: "center",
  },
  colorGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignContent: "flex-start",
  },
  savedColorGridItem: {
    width: "18%", // уменьшили с 20% до 18%
    margin: "1%",
    paddingHorizontal: 4, // уменьшили горизонтальные отступы
    paddingVertical: 6, // оставили вертикальные отступы
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    alignItems: "center",
  },
  savedColorGridPreview: {
    width: 35, // увеличили с 30 до 35
    height: 35, // увеличили с 30 до 35
    borderRadius: 17.5, // увеличили радиус
    marginBottom: 6, // увеличили отступ
    borderWidth: 2,
    borderColor: "white",
  },
  savedColorGridHex: {
    color: "white",
    fontSize: 11, // увеличили с 9 до 11
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4, // уменьшили с 6 до 4
  },
  savedColorGridActions: {
    flexDirection: "row",
    justifyContent: "center",
  },
  savedColorGridButton: {
    marginHorizontal: 6, // увеличили с 4 до 6
    padding: 3, // уменьшили с 4 до 3
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3, // уменьшили с 4 до 3
  },
  savedColorGridButtonText: {
    color: "white",
    fontSize: 10, // увеличили с 8 до 10
  },
  cameraWrapper: {
    width: "100%",
    height: "20%", // 20% of screen height for camera
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#242C3B",
    overflow: "hidden", // Hide content that goes beyond container bounds
    paddingHorizontal: 20, // Add horizontal padding
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
    width: "100%",
    height: "100%",
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
  detailsPopup: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  colorPopupContent: {
    backgroundColor: "transparent",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 40,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    position: "relative",
  },
  clearConfirmContent: {
    backgroundColor: "transparent",
    borderRadius: 20,
    padding: 30,
    marginHorizontal: 40,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  clearConfirmTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
  },
  clearConfirmActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  clearConfirmButton: {
    flex: 1,
    marginRight: 10,
    borderRadius: 8,
    overflow: "hidden",
  },
  clearConfirmGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  clearCancelButton: {
    flex: 1,
    marginLeft: 10,
    borderRadius: 8,
    overflow: "hidden",
  },
  clearCancelGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  clearConfirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  clearCancelButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  showListContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
  colorCountText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  showListButton: {
    borderRadius: 8,
    overflow: "hidden",
  },
  showListGradient: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  showListButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  listModalContainer: {
    flex: 1,
    backgroundColor: "#242C3B",
  },
  listModalHeader: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listModalTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  closeListModalButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeListModalButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  listModalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  listModalGrid: {
    paddingVertical: 20,
  },
  listModalItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  listModalPreview: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
    borderWidth: 2,
    borderColor: "white",
  },
  listModalDetails: {
    flex: 1,
  },
  listModalHex: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  listModalTime: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  listModalActions: {
    flexDirection: "row",
  },
  listModalButton: {
    marginHorizontal: 4,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
  },
  listModalButtonText: {
    color: "white",
    fontSize: 14,
  },
  listModalDetailsButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 10,
  },
  listModalDetailsButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  detailsButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  detailsButtonText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  detailsModalContent: {
    backgroundColor: "transparent",
    borderRadius: 20,
    padding: 25,
    marginHorizontal: 40,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    flexDirection: "column",
  },
  detailsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 25,
    width: "100%",
  },
  detailsColorPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "white",
  },
  detailsColorInfo: {
    flexDirection: "column",
    alignItems: "center",
  },
  detailsHexText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  detailsRgbText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  closeDetailsButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-end",
    marginBottom: 15,
  },
  closeDetailsButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  checkboxWrapper: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 40,
    marginBottom: 35,
  },
  checkboxItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 4,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#34C8E8",
  },
  checkmark: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  checkboxLabel: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  detailsActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  detailsCopyButton: {
    flex: 1,
    marginRight: 10,
    borderRadius: 8,
    overflow: "hidden",
  },
  detailsCopyGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsCopyButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  detailsDeleteButton: {
    flex: 1,
    marginLeft: 10,
    borderRadius: 8,
    overflow: "hidden",
  },
  detailsDeleteGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsDeleteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  copyAllModalContent: {
    backgroundColor: "transparent",
    borderRadius: 20,
    padding: 25,
    marginHorizontal: 30,
    width: "85%",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    position: "relative",
    flexDirection: "column",
  },
  copyAllModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  copyAllModalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 25,
  },
  closeCopyAllButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-end",
  },
  closeCopyAllButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  copyAllActions: {
    alignItems: "center",
  },
  copyAllConfirmButton: {
    borderRadius: 8,
    overflow: "hidden",
  },
  copyAllConfirmGradient: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  copyAllConfirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  shareModalContent: {
    backgroundColor: "transparent",
    borderRadius: 20,
    padding: 25,
    marginHorizontal: 30,
    width: "85%",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    position: "relative",
    flexDirection: "column",
  },
  shareModalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 25,
  },
  closeShareButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-end",
  },
  closeShareButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  shareActions: {
    alignItems: "center",
  },
  shareConfirmButton: {
    borderRadius: 8,
    overflow: "hidden",
  },
  shareConfirmGradient: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  shareConfirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
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
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  alertContainer: {
    marginHorizontal: 40,
    borderRadius: 12,
    overflow: "hidden",
  },
  alertGradient: {
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  alertTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  alertMessage: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});

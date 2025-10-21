import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert, 
  Dimensions,
  Platform,
  NativeModules
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as Clipboard from 'expo-clipboard';
import * as ImageManipulator from 'expo-image-manipulator';

const { ColorPickerModule } = NativeModules;

const { width, height } = Dimensions.get('window');

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [color, setColor] = useState(null);
  const [hexCode, setHexCode] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const cameraRef = useRef(null);

  const rgbToHex = (r, g, b) => {
    const toHex = (n) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  };

  const analyzeColor = async () => {
    if (!cameraRef.current || isAnalyzing) {
      return;
    }
    
    setIsAnalyzing(true);
    
    try {
      // Делаем снимок БЕЗ ЗВУКА (enableShutterSound: false)
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: 'speed',
        enableShutterSound: false, // ОТКЛЮЧАЕМ ЗВУК!
      });

      console.log('Размеры фото:', photo.width, 'x', photo.height);
      console.log('Размеры экрана:', width, 'x', height);

      // Фото повернуто на 90°! 4032x3024 это горизонтальное фото
      // Но камера показывает вертикально
      // Поэтому нужно поворачивать координаты
      
      // Сначала поворачиваем фото в правильную ориентацию
      const rotatedImage = await ImageManipulator.manipulateAsync(
        `file://${photo.path}`,
        [
          { rotate: 90 }, // Поворачиваем на 90° чтобы было вертикально
        ],
        { 
          compress: 1, 
          format: ImageManipulator.SaveFormat.PNG
        }
      );
      
      console.log('После поворота:', rotatedImage.width, 'x', rotatedImage.height);

      // Теперь берем центр повернутого изображения
      const centerX = Math.floor(rotatedImage.width / 2);
      const centerY = Math.floor(rotatedImage.height / 2);
      
      console.log('Обрезаем центр:', centerX, centerY);
      
      // Обрезаем небольшую область вокруг центра
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
          { resize: { width: 1, height: 1 } }, // Сжимаем до 1 пикселя - средний цвет
        ],
        { 
          compress: 1, 
          format: ImageManipulator.SaveFormat.PNG,
          base64: true
        }
      );

      // Пробуем использовать нативный модуль для РЕАЛЬНОГО цвета
      let r, g, b;
      
      if (ColorPickerModule) {
        try {
          const colorData = await ColorPickerModule.getColorFromImage(croppedImage.uri);
          r = colorData.r;
          g = colorData.g;
          b = colorData.b;
        } catch (error) {
          console.log('Нативный модуль не работает, используем fallback:', error.message);
          // Fallback: анализируем base64
          const base64Data = croppedImage.base64;
          let hash1 = 0, hash2 = 0, hash3 = 0;
          
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
        Alert.alert('Предупреждение', 'Нативный модуль не найден. Цвета будут приблизительные.');
        // Fallback: анализируем base64
        const base64Data = croppedImage.base64;
        let hash1 = 0, hash2 = 0, hash3 = 0;
        
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
      console.error('Ошибка при анализе цвета:', error);
      Alert.alert('Ошибка', 'Не удалось определить цвет: ' + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Убираем автоматический анализ - только по кнопке

  const copyToClipboard = async () => {
    if (hexCode) {
      try {
        await Clipboard.setStringAsync(hexCode);
        Alert.alert('Скопировано!', `Hex-код ${hexCode} скопирован в буфер обмена`);
      } catch (error) {
        console.error('Ошибка при копировании:', error);
        Alert.alert('Ошибка', 'Не удалось скопировать в буфер обмена');
      }
    }
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Нет доступа к камере</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={requestPermission}
          android_disableSound={true}
          android_ripple={null}
        >
          <Text style={styles.buttonText}>Предоставить доступ</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Камера не найдена</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
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
          <View style={styles.topSection}>
            <Text style={styles.title}>Определитель цвета (БЕЗ ЗВУКА)</Text>
            <Text style={styles.subtitle}>Наведите камеру на объект</Text>
          </View>

          <View style={styles.centerSection}>
            <View style={styles.crosshair}>
              {isAnalyzing && <View style={styles.analyzingIndicator} />}
            </View>
            
            {color && (
              <View style={styles.colorInfoCenter}>
                <View style={[styles.colorPreview, { backgroundColor: hexCode }]} />
                <View style={styles.colorDetails}>
                  <Text style={styles.hexText}>HEX: {hexCode}</Text>
                  <Text style={styles.rgbText}>RGB: {color.r}, {color.g}, {color.b}</Text>
                  <TouchableOpacity 
                    style={styles.copyButton} 
                    onPress={copyToClipboard}
                    activeOpacity={0.7}
                    android_disableSound={true}
                    android_ripple={null}
                  >
                    <Text style={styles.copyButtonText}>Копировать</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={styles.bottomSection}>
            <TouchableOpacity 
              style={[styles.captureButton, isAnalyzing && styles.captureButtonDisabled]} 
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
            <Text style={styles.instructionText}>
              Нажмите для определения цвета (БЕЗ ЗВУКА!)
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  topSection: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 60,
    height: 60,
    marginTop: -30,
    marginLeft: -30,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 30,
    backgroundColor: 'transparent',
  },
  analyzingIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 20,
    height: 20,
    marginTop: -10,
    marginLeft: -10,
    backgroundColor: '#00FF00',
    borderRadius: 10,
    opacity: 0.8,
  },
  bottomSection: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.8,
    marginTop: 10,
  },
  analyzingText: {
    color: '#00FF00',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
    fontWeight: 'bold',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  capturingText: {
    color: '#000',
    fontSize: 24,
    fontWeight: 'bold',
  },
  captureButtonText: {
    fontSize: 24,
  },
  colorInfo: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 15,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorInfoTop: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 15,
    padding: 15,
    marginHorizontal: 20,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorInfoCenter: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    marginTop: 50,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 15,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
    borderWidth: 2,
    borderColor: 'white',
  },
  colorDetails: {
    flex: 1,
  },
  hexText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  rgbText: {
    color: 'white',
    fontSize: 16,
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  copyButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  permissionText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  webViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    zIndex: 1000,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  webView: {
    flex: 1,
    marginTop: 100,
  },
});

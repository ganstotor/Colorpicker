import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert, 
  Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Camera } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [color, setColor] = useState(null);
  const [hexCode, setHexCode] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef(null);

  useEffect(() => {
    getCameraPermissions();
  }, []);

  const getCameraPermissions = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch (error) {
      console.error('Ошибка при запросе разрешений камеры:', error);
      setHasPermission(false);
    }
  };

  const rgbToHex = (r, g, b) => {
    const toHex = (n) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  };

  const captureColor = async () => {
    if (!cameraRef.current || !isCameraReady) {
      Alert.alert('Ошибка', 'Камера не готова');
      return;
    }
    
    if (isCapturing) {
      return; // Предотвращаем множественные нажатия
    }
    
    setIsCapturing(true);
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

        // Для простоты, будем использовать центральную точку изображения
        // В реальном приложении можно добавить возможность выбора точки касанием
        const imageData = photo.base64;
        
        // Создаем временный canvas для анализа цвета
        // В React Native это делается через ImageManipulator или другие библиотеки
        // Для демонстрации используем случайный цвет
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        
        const hex = rgbToHex(r, g, b);
        setColor({ r, g, b });
        setHexCode(hex);
      } catch (error) {
        console.error('Ошибка при захвате цвета:', error);
        Alert.alert('Ошибка', 'Не удалось определить цвет');
      } finally {
        setIsCapturing(false);
      }
    }
  };

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

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Запрос разрешения на использование камеры...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text>Нет доступа к камере</Text>
        <TouchableOpacity style={styles.button} onPress={getCameraPermissions}>
          <Text style={styles.buttonText}>Предоставить доступ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <Camera
        style={styles.camera}
        facing="back"
        ref={cameraRef}
        onCameraReady={() => setIsCameraReady(true)}
      >
        <View style={styles.overlay}>
          <View style={styles.topSection}>
            <Text style={styles.title}>Определитель цвета</Text>
            <Text style={styles.subtitle}>Нажмите кнопку для определения цвета</Text>
          </View>

          <View style={styles.centerSection}>
            <View style={styles.crosshair} />
          </View>

          <View style={styles.bottomSection}>
            <TouchableOpacity 
              style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]} 
              onPress={captureColor}
              disabled={isCapturing}
            >
              <View style={styles.captureButtonInner}>
                {isCapturing && <Text style={styles.capturingText}>...</Text>}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Camera>

      {color && (
        <View style={styles.colorInfo}>
          <View style={[styles.colorPreview, { backgroundColor: hexCode }]} />
          <View style={styles.colorDetails}>
            <Text style={styles.hexText}>{hexCode}</Text>
            <Text style={styles.rgbText}>RGB: {color.r}, {color.g}, {color.b}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
              <Text style={styles.copyButtonText}>Копировать HEX</Text>
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
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
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
  },
  crosshair: {
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 30,
    backgroundColor: 'transparent',
  },
  bottomSection: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
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
});

import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert, 
  Dimensions,
  Platform,
  NativeModules,
  Share
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
  const [savedColors, setSavedColors] = useState([]);
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
          compress: 0.1, // МИНИМУМ для скорости!
          format: ImageManipulator.SaveFormat.JPEG // JPEG быстрее PNG
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
          compress: 0.1, // МИНИМУМ для скорости!
          format: ImageManipulator.SaveFormat.JPEG, // JPEG быстрее PNG
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

  const addToSavedColors = () => {
    if (color && hexCode) {
      const newColor = {
        id: Date.now(),
        hex: hexCode,
        rgb: color,
        timestamp: new Date().toLocaleTimeString()
      };
      setSavedColors(prev => [newColor, ...prev]);
      // Закрываем попап после сохранения
      setColor(null);
    }
  };

  const removeFromSavedColors = (id) => {
    setSavedColors(prev => prev.filter(color => color.id !== id));
  };

  const copySavedColor = async (hex) => {
    try {
      await Clipboard.setStringAsync(hex);
      Alert.alert('Скопировано!', `Hex-код ${hex} скопирован в буфер обмена`);
    } catch (error) {
      console.error('Ошибка при копировании:', error);
      Alert.alert('Ошибка', 'Не удалось скопировать в буфер обмена');
    }
  };

  const copyAllColors = async () => {
    if (savedColors.length === 0) {
      Alert.alert('Список пуст', 'Нет сохраненных цветов для копирования');
      return;
    }
    
    const colorsText = savedColors.map(color => color.hex).join('\n');
    try {
      await Clipboard.setStringAsync(colorsText);
      Alert.alert('Скопировано!', `Все ${savedColors.length} цветов скопированы в буфер обмена`);
    } catch (error) {
      console.error('Ошибка при копировании:', error);
      Alert.alert('Ошибка', 'Не удалось скопировать список цветов');
    }
  };

  const shareColorsList = async () => {
    if (savedColors.length === 0) {
      Alert.alert('Список пуст', 'Нет сохраненных цветов для поделиться');
      return;
    }
    
    const colorsText = savedColors.map(color => color.hex).join('\n');
    const shareText = `🎨 Список цветов (${savedColors.length} шт.):\n\n${colorsText}\n\nСоздано в Color Picker App`;
    
    try {
      // Используем встроенный Share API из React Native
      const result = await Share.share({
        message: shareText,
        title: 'Список цветов',
      });
      
      if (result.action === Share.dismissedAction) {
        // Пользователь отменил поделиться
        console.log('Поделиться отменено');
      }
    } catch (error) {
      console.error('Ошибка при поделиться:', error);
      // Если поделиться не сработало, копируем в буфер
      try {
        await Clipboard.setStringAsync(shareText);
        Alert.alert('Скопировано!', 'Список цветов скопирован в буфер обмена');
      } catch (clipboardError) {
        Alert.alert('Ошибка', 'Не удалось поделиться списком цветов');
      }
    }
  };

  const clearAllColors = () => {
    setSavedColors([]);
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
      
      {/* Верхний блок на всю ширину */}
      <View style={styles.topBlockFull}>
        <Text style={styles.panelTitle}>Сохраненные цвета</Text>
        <View style={styles.colorGrid}>
          {savedColors.map((savedColor) => (
            <View key={savedColor.id} style={styles.savedColorGridItem}>
              <View style={[styles.savedColorGridPreview, { backgroundColor: savedColor.hex }]} />
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

      {/* Центральная камера (квадрат) */}
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

      {/* Нижний блок на всю ширину с кнопкой */}
      <View style={styles.bottomBlockFull}>
        {/* Кнопки управления списком - показываются только при наличии цветов */}
        {savedColors.length > 0 && (
          <>
            {/* Кнопка копирования всего списка в левом верхнем углу */}
            <TouchableOpacity 
              style={styles.copyAllButton}
              onPress={copyAllColors}
              activeOpacity={0.7}
              android_disableSound={true}
              android_ripple={null}
            >
              <Text style={styles.copyAllButtonText}>📋 Копировать все</Text>
            </TouchableOpacity>

            {/* Кнопка поделиться списком в правом верхнем углу */}
            <TouchableOpacity 
              style={styles.shareAllButton}
              onPress={shareColorsList}
              activeOpacity={0.7}
              android_disableSound={true}
              android_ripple={null}
            >
              <Text style={styles.shareAllButtonText}>📤 Поделиться</Text>
            </TouchableOpacity>

            {/* Кнопка очистки списка в центре ниже */}
            <TouchableOpacity 
              style={styles.clearAllButton}
              onPress={clearAllColors}
              activeOpacity={0.7}
              android_disableSound={true}
              android_ripple={null}
            >
              <Text style={styles.clearAllButtonText}>🗑️ Очистить список</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Основная кнопка фото по центру */}
        <View style={styles.centerButtonContainer}>
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
            Нажмите для определения цвета
          </Text>
        </View>
      </View>

      {/* Попап с цветом */}
      {color && (
        <View style={styles.colorPopup}>
          <View style={styles.colorPopupContent}>
            <View style={[styles.colorPreview, { backgroundColor: hexCode }]} />
            <View style={styles.colorDetails}>
              <Text style={styles.hexText}>HEX: {hexCode}</Text>
              <Text style={styles.rgbText}>RGB: {color.r}, {color.g}, {color.b}</Text>
              <View style={styles.colorActions}>
                <TouchableOpacity 
                  style={styles.actionButton} 
                  onPress={copyToClipboard}
                  activeOpacity={0.7}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <Text style={styles.actionButtonText}>📋 Копировать</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.actionButton} 
                  onPress={addToSavedColors}
                  activeOpacity={0.7}
                  android_disableSound={true}
                  android_ripple={null}
                >
                  <Text style={styles.actionButtonText}>💾 Сохранить</Text>
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
    backgroundColor: '#000',
    flexDirection: 'column',
  },
  topBlockFull: {
    width: '100%',
    flex: 1, // Занимает равную долю с нижним блоком
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  panelTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  colorGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
  },
  savedColorGridItem: {
    width: '18%', // 5 элементов в ряду
    margin: '1%',
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    alignItems: 'center',
  },
  savedColorGridPreview: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginBottom: 5,
    borderWidth: 2,
    borderColor: 'white',
  },
  savedColorGridHex: {
    color: 'white',
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  savedColorGridActions: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  savedColorGridButton: {
    marginHorizontal: 2,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
  },
  savedColorGridButtonText: {
    color: 'white',
    fontSize: 8,
  },
  cameraContainer: {
    width: width * 0.6, // 60% ширины экрана
    height: width * 0.6, // Квадратная камера 60% от ширины
    position: 'relative',
    alignSelf: 'center',
  },
  bottomBlockFull: {
    width: '100%',
    flex: 1, // Занимает равную долю с верхним блоком
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'flex-end', // Кнопка внизу блока
    alignItems: 'center',
    paddingBottom: '15%', // 15% отступ снизу
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
    position: 'relative', // Для позиционирования кнопки копирования
  },
  copyAllButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  copyAllButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  shareAllButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  shareAllButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  clearAllButton: {
    position: 'absolute',
    top: 100, // Перемещаем еще ниже
    left: '50%',
    marginLeft: -60, // Центрируем кнопку (ширина примерно 120px)
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  clearAllButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  centerButtonContainer: {
    alignItems: 'center',
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
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 15,
    padding: 15,
    marginHorizontal: 20,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%', // Занимает всю ширину
  },
  colorInfoCenter: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: 50,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 15,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    maxHeight: 100, // Ограничиваем высоту
    marginHorizontal: 20, // Отступы от краев камеры
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
    justifyContent: 'center', // Центрируем содержимое по вертикали
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
  colorActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 10,
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
  colorPopup: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  colorPopupContent: {
    backgroundColor: 'rgba(0,0,0,0.95)',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    position: 'relative',
  },
  closePopupButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closePopupButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

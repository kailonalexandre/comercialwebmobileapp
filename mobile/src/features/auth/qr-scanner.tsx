import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/components/button';
import { Text } from '@/shared/components/text';
import { colors, spacing } from '@/shared/theme/tokens';

type Props = { onScanned: (data: string) => void; onCancel: () => void };

export function QrScanner({ onScanned, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  // O leitor dispara várias vezes por segundo; o código é de uso único, então só o primeiro vale.
  const done = useRef(false);

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>A câmera é usada só para ler o QR Code de pareamento.</Text>
        <Button label="Permitir câmera" onPress={requestPermission} />
        <Button label="Cancelar" variant="outline" onPress={onCancel} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.flex}>
      <CameraView
        style={styles.flex}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          done.current = true;
          onScanned(data);
        }}
      />
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Button label="Cancelar" variant="inverse" onPress={onCancel} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.background },
  text: { textAlign: 'center' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.xl },
});

import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/components/button';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';

type Props = {
  types: BarcodeType[];
  // Complemento de "A câmera é usada só para …" na tela de permissão.
  purpose: string;
  onScanned: (data: string) => void;
  onCancel: () => void;
};

// Leitor de câmera em tela cheia: QR de pareamento e código de barras de produto.
export function CodeScanner({ types, purpose, onScanned, onCancel }: Props) {
  const styles = useStyles();
  const [permission, requestPermission] = useCameraPermissions();
  // O leitor dispara várias vezes por segundo; só a primeira leitura vale.
  const done = useRef(false);

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>{`A câmera é usada só para ${purpose}.`}</Text>
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
        barcodeScannerSettings={{ barcodeTypes: types }}
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

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.background },
  text: { textAlign: 'center' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.xl },
}));

import Constants from 'expo-constants';
import { checkForUpdate } from 'expo-in-app-updates';
import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, View } from 'react-native';

import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { radius, spacing } from '@/shared/theme/tokens';

// Quem sabe se há versão nova é a própria Play Store (In-App Updates compara o versionCode publicado com o instalado):
// nada para manter a cada release. Só Android instalado pela Play; APK avulso (app DEV), emulador ou sem Play: a
// checagem falha e o aviso não aparece.
export function UpdatePrompt() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    checkForUpdate().then(
      (r) => active && r.updateAvailable && setVisible(true),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);

  function openStore() {
    setVisible(false);
    const id = Constants.expoConfig?.android?.package;
    // market:// abre direto o app da Play Store; sem ele (raro), a página web da loja.
    void Linking.openURL(`market://details?id=${id}`).catch(() => Linking.openURL(`https://play.google.com/store/apps/details?id=${id}`));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Icon name="cloud-download-outline" size={32} color={colors.primary} />
          <Text variant="title">Nova versão disponível</Text>
          <Text color="textMuted">Uma nova versão do Infinit Comercial está disponível. Toque em Atualizar para instalar pela Play Store.</Text>
          <Button label="Atualizar" icon="logo-google-playstore" onPress={openStore} />
          <Button label="Agora não" variant="outline" onPress={() => setVisible(false)} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.scrim },
  card: { gap: spacing.md, padding: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.background },
}));

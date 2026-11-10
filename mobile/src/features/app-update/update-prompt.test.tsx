import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { checkForUpdate } from 'expo-in-app-updates';
import { Linking, Platform } from 'react-native';

import { UpdatePrompt } from '@/features/app-update/update-prompt';
import { ThemeProvider } from '@/shared/theme/theme-context';

jest.mock('expo-in-app-updates', () => ({ checkForUpdate: jest.fn() }));
jest.mock('expo-constants', () => ({ expoConfig: { android: { package: 'br.com.exemplo.app' } } }));
jest.mock('@/shared/components/icon', () => ({ Icon: () => null }));
jest.setTimeout(30_000);

const check = checkForUpdate as jest.Mock;
const ui = () => render(<ThemeProvider><UpdatePrompt /></ThemeProvider>); // RNTL 14: render é assíncrono

beforeAll(() => {
  Platform.OS = 'android';
});

test('com versão nova na Play, mostra o aviso e o botão abre a página do app na loja', async () => {
  check.mockResolvedValue({ updateAvailable: true, storeVersion: '7' });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await ui();

  await fireEvent.press(await screen.findByText('Atualizar'));

  expect(open).toHaveBeenCalledWith('market://details?id=br.com.exemplo.app');
});

test('sem versão nova, ou fora da Play (a checagem falha), não mostra nada', async () => {
  check.mockResolvedValueOnce({ updateAvailable: false, storeVersion: '6' });
  await ui();
  expect(screen.queryByText('Nova versão disponível')).toBeNull();

  check.mockRejectedValueOnce(new Error('ERR_CHECK_FOR_UPDATE'));
  await ui();
  await act(async () => undefined); // deixa a checagem terminar

  expect(screen.queryByText('Nova versão disponível')).toBeNull();
});

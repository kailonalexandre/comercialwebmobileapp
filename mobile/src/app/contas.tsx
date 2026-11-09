import { AccountPickerScreen } from '@/features/auth/account-picker-screen';
import { useSession } from '@/features/auth/session-context';
import { TerminalLoginScreen } from '@/features/auth/terminal-login-screen';

// Aparelho vinculado: entrada individual (operador/PIN/senha). Sem vínculo: contas do QR antigo.
export default function AccountsRoute() {
  return useSession().terminal ? <TerminalLoginScreen /> : <AccountPickerScreen />;
}

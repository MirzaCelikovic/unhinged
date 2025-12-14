import { useLocalSearchParams } from 'expo-router';
import AccountsList from '~/components/AccountsList';
import { AccountListType } from '~/lib/useFollowerStats';

export default function List() {
  const { userId, type, isMainAccount } = useLocalSearchParams<{
    userId: string;
    type: AccountListType;
    isMainAccount: string;
  }>();

  return (
    <AccountsList
      userId={userId!}
      type={type!}
      isMainAccount={isMainAccount === 'true'}
    />
  );
}

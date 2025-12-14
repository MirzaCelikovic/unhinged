import { View, Text, StyleSheet, SafeAreaView, Pressable, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import { useAccountList, AccountListType, getAccountListLabel } from '~/lib/useFollowerStats';

interface AccountsListProps {
  userId: string;
  type: AccountListType;
  isMainAccount: boolean;
}

export default function AccountsList({ userId, type, isMainAccount }: AccountsListProps) {
  const { data: accounts, isLoading } = useAccountList(userId ?? null, type ?? null);

  const title = type ? getAccountListLabel(type, isMainAccount) : '';

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      {/* Header */}
      <SafeAreaView>
        <View className="flex-row items-center justify-between px-4 pb-3">
          <View className="flex-1 items-center pt-6">
            <Logo width={160} height={30} />
          </View>
          <Pressable
            className="absolute right-4 p-2 active:opacity-70"
            onPress={() => router.back()}>
            <X size={24} color="#000000" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Content */}
      <View className="flex-1 p-4">
        <Text className="font-roboto-bold mb-4 text-2xl">{title}</Text>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-500">Loading...</Text>
          </View>
        ) : accounts.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-500">No accounts found</Text>
          </View>
        ) : (
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="gap-3 pb-8">
              {accounts.map((account) => (
                <View
                  key={account.id}
                  className="flex-row items-center gap-3 rounded-2xl bg-white p-4">
                  {account.profile_pic_url ? (
                    <Image
                      source={{ uri: account.profile_pic_url }}
                      className="h-12 w-12 rounded-full"
                    />
                  ) : (
                    <View className="h-12 w-12 rounded-full bg-gray-300" />
                  )}
                  <Text className="flex-1 text-base font-medium">{account.username}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

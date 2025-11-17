import { Tabs } from 'expo-router';
import { Instagram } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Instagram color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

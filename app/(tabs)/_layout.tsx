import { Tabs } from 'expo-router';
import { Instagram, HatGlasses } from 'lucide-react-native';

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
      <Tabs.Screen
        name="tracking"
        options={{
          title: 'Tracking',
          tabBarLabel: 'Tracking',
          tabBarIcon: ({ color, size }) => <HatGlasses color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

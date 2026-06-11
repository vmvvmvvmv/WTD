import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { BriefingScreen } from '../screens/BriefingScreen';
import { DetailDataScreen } from '../screens/DetailDataScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MapScreen } from '../screens/MapScreen';
import { MyPageScreen } from '../screens/MyPageScreen';
import { useTheme } from '../theme/ThemeProvider';

type RootTabParamList = {
  Home: undefined;
  Map: undefined;
  DetailData: undefined;
  Briefing: undefined;
  MyPage: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function AppNavigator() {
  const { colors } = useTheme();

  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            height: 64,
            paddingBottom: 8,
            paddingTop: 7,
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
        <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
        <Tab.Screen name="DetailData" component={DetailDataScreen} options={{ title: 'Data' }} />
        <Tab.Screen name="Briefing" component={BriefingScreen} options={{ title: 'Briefing' }} />
        <Tab.Screen name="MyPage" component={MyPageScreen} options={{ title: 'Account' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

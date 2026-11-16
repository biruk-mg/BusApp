import { useEffect } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { RootStackParamList } from '../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>

export default function SplashScreen({ navigation }: Props) {
  const opacity = new Animated.Value(0)
  const scale = new Animated.Value(0.8)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start()

    setTimeout(() => {
      navigation.replace('Login')
    }, 2500)
  }, [])

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center' }}>
        <Text style={styles.logo}>
          <Text style={styles.logoRed}>Mugo</Text>
          <Text style={styles.logoGold}>Bus</Text>
        </Text>
        <Text style={styles.tagline}>Travel Across Ethiopia with Ease</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  logoRed: {
    color: '#C0392B',
    fontSize: 48,
    fontWeight: 'bold',
  },
  logoGold: {
    color: '#D4A017',
    fontSize: 48,
    fontWeight: 'bold',
  },
  tagline: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
  },
})
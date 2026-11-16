export type RootStackParamList = {
  Splash: undefined
  Login: undefined
  Register: undefined
  Main: undefined
  Search: {
    fromCity: string
    toCity: string
    date: string
    passengers: number
  }
  SeatSelection: {
    scheduleId: string
    passengers: number
  }
  BookingDetail: {
    bookingId: string
  }
}

export type BottomTabParamList = {
  Home: undefined
  Bookings: undefined
  Profile: undefined
}
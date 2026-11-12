import type { Locale } from './config'

// City names as people say them. The database and the links keep the English name:
// this is only for what is shown. A city that is not here is shown as it is.
const AM: Record<string, string> = {
  'Addis Ababa': 'አዲስ አበባ', Adama: 'አዳማ', Hawassa: 'ሀዋሳ', 'Bahir Dar': 'ባሕር ዳር', 'Dire Dawa': 'ድሬዳዋ',
  Jimma: 'ጅማ', Mekelle: 'መቀሌ', Gondar: 'ጎንደር', Dessie: 'ደሴ', 'Debre Markos': 'ደብረ ማርቆስ',
  'Debre Birhan': 'ደብረ ብርሃን', Hossana: 'ሆሳዕና', 'Arba Minch': 'አርባ ምንጭ', Harar: 'ሐረር',
  Nekemte: 'ነቀምት', Jijiga: 'ጅጅጋ', Shashemene: 'ሻሸመኔ', 'Wolaita Sodo': 'ወላይታ ሶዶ', Sodo: 'ሶዶ',
  Woldia: 'ወልዲያ', Axum: 'አክሱም', Semera: 'ሰመራ', Gambela: 'ጋምቤላ', Bishoftu: 'ቢሾፍቱ', 'Debre Zeit': 'ደብረ ዘይት',
  Ambo: 'አምቦ', Welkite: 'ወልቂጤ', Mojo: 'ሞጆ', Dilla: 'ዲላ', Jinka: 'ጂንካ', 'Mizan Teferi': 'ሚዛን ተፈሪ',
  Metu: 'መቱ', Assosa: 'አሶሳ', Gode: 'ጎዴ', Kombolcha: 'ኮምቦልቻ', Lalibela: 'ላሊበላ', Durame: 'ዱራሜ',
  Butajira: 'ቡታጅራ', Robe: 'ሮቤ', Goba: 'ጎባ',
}
const OM: Record<string, string> = {
  'Addis Ababa': 'Finfinnee', Adama: 'Adaamaa', Hawassa: 'Hawaasaa', 'Bahir Dar': 'Baahir Daar',
  'Dire Dawa': 'Dirre Dhawaa', Jimma: 'Jimmaa', Nekemte: 'Naqamtee', Shashemene: 'Shashamannee',
  Bishoftu: 'Bishooftuu', Ambo: 'Amboo', Mojo: 'Mojjo', Metu: 'Mattuu', Robe: 'Roobee', Goba: 'Gobaa',
  Jijiga: 'Jigjiga', Dilla: 'Diillaa', Assosa: 'Asosaa', Sodo: 'Soddo',
}

export function cityName(locale: Locale, name: string): string {
  if (locale === 'am') return AM[name] || name
  if (locale === 'om') return OM[name] || name
  return name
}

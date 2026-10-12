import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type AppLanguage = 'en' | 'ha' | 'yo' | 'ig';

export const languageOptions: { value: AppLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ha', label: 'Hausa' },
  { value: 'yo', label: 'Yorùbá' },
  { value: 'ig', label: 'Igbo' },
];

const LANGUAGE_STORAGE_KEY = 'mvs_preferred_language';

const translations: Record<AppLanguage, Record<string, string>> = {
  en: {
    'nav.home': 'Home',
    'nav.vets': 'Vets',
    'nav.community': 'Community',
    'nav.chat': 'Chat',
    'nav.chats': 'Chats',
    'nav.profile': 'Profile',
    'nav.dashboard': 'Dashboard',
    'nav.addProduct': 'Add Product',
    'nav.inventory': 'Inventory',
    'auth.eyebrow': 'MOBILE VETERINARY SERVICES',
    'auth.title': 'Your farm animals/pet care circle starts here.',
    'auth.subtitle': 'Create an account or sign in to access trusted animal care and supplies, or join us as a certified veterinary professional or merchant to serve our growing ecosystem.',
    'auth.signIn': 'Sign in',
    'auth.createAccount': 'Create account',
    'auth.registrationType': 'Please select your registration type to proceed:',
    'auth.petOwner': 'Pet owner/Farmer',
    'auth.veterinarian': 'Veterinarian',
    'auth.merchant': 'Merchant',
    'auth.email': 'Email address',
    'auth.phone': 'Nigerian phone number without country code',
    'auth.vcn': 'VCN number',
    'auth.password': 'Password',
    'auth.passwordHint': 'Use uppercase, lowercase, a number, and a special symbol (@$!%*?&).',
    'auth.welcomeBack': 'Welcome back! Enter your credentials to access your dashboard.',
    'auth.fillDetails': 'Fill in your details above to get started.',
    'auth.submitSignIn': 'Sign in',
    'auth.submitSignUp': 'Create account',
    'auth.selectLanguage': 'Choose your language',
    'auth.fullName': 'Full name',
    'auth.vetNameExample': 'Dr. Ibrahim Paul',
    'auth.emailRequired': 'Enter your email and password to continue.',
    'auth.invalidPhone': 'Enter a valid 10-digit Nigerian phone number starting with 7, 8, or 9.',
    'auth.vcnRequired': 'Enter your VCN number to register as a veterinarian.',
    'settings.account': 'Account Settings',
    'settings.language': 'App language',
    'settings.languageDescription': 'Choose the language used across MVS.',
    'settings.languageSaved': 'Language preference saved.',
    'settings.languageSaveFailed': 'Could not save your language preference. Please try again.',
    'settings.editProfile': 'Edit Profile',
    'settings.changePassword': 'Change Password',
    'settings.notifications': 'Notifications',
    'settings.bankAccount': 'Bank Account',
    'settings.businessInfo': 'Business Information',
    'settings.practiceInfo': 'Practice Information',
    'settings.logOut': 'Log out',
    'settings.deleteAccount': 'Delete account',
    'profile.title': 'My Profile',
    'profile.pets': 'My Pets Record',
    'profile.farms': 'My Farm & Livestock Records',
    'dashboard.practice': 'Practice Dashboard',
    'dashboard.store': 'Store Dashboard',
    'dashboard.managePractice': 'Manage consultations and earnings',
    'dashboard.manageStore': 'Manage your inventory and sales',
    'dashboard.consultations': 'Consultations',
    'dashboard.overallRating': 'Overall Rating',
    'dashboard.totalEarnings': 'Total Earnings',
    'dashboard.totalSales': 'Total Sales',
    'dashboard.activeListings': 'Active Listings',
    'dashboard.pendingOrders': 'Pending Orders',
    'dashboard.marketplace': 'Global Marketplace',
    'dashboard.storeInventory': 'Global Marketplace Inventory',
    'dashboard.addProduct': 'Add New Product',
    'dashboard.viewDetails': 'View Details',
    'dashboard.proceedToBuy': 'Proceed to Buy',
    'common.viewProfile': 'View profile',
    'common.chatWithVet': 'Chat with Vet',
    'home.hello': 'Hello, {name}!',
    'home.subtitle': 'How are your furry buddies doing today?',
    'home.askAssistant': 'Ask AI Assistant',
    'home.assistantDescription': 'Get quick triage and animal care guidance.',
    'home.consultVet': 'Consult a Vet Now',
    'home.consultDescription': 'Get professional advice instantly',
    'home.consult': 'Consult',
    'home.marketplace': 'Marketplace',
    'home.browseAll': 'Browse All',
    'common.tryAgain': 'Try again',
    'knowledge.title': 'MVS Knowledge Hub',
    'knowledge.viewAll': 'View All',
    'knowledge.search': 'Search articles...',
    'knowledge.all': 'All',
    'knowledge.vaccination': 'Vaccination',
    'knowledge.livestockCare': 'Livestock Care',
    'knowledge.hydrationNutrition': 'Hydration & Nutrition',
    'knowledge.firstAid': 'First Aid & Triage',
    'knowledge.biosecurity': 'Biosecurity',
    'knowledge.publicHealth': 'Public Health',
    'knowledge.noResults': 'No articles match your search.',
    'knowledge.closeHub': 'Close Knowledge Hub',
    'knowledge.closeArticle': 'Close article',
    'knowledge.gotIt': 'Got it',
  },
  ha: {
    'nav.home': 'Gida',
    'nav.vets': 'Likitoci',
    'nav.community': 'Al’umma',
    'nav.chat': 'Hira',
    'nav.chats': 'Hirarraki',
    'nav.profile': 'Bayanan martaba',
    'nav.dashboard': 'Shafin aiki',
    'nav.addProduct': 'Ƙara kaya',
    'nav.inventory': 'Kayayyaki',
    'auth.eyebrow': 'Ayyukan Kula da Dabbobi ta Wayar Hannu',
    'auth.title': 'Kulawar dabbobin gidanku ko gonarku tana farawa a nan.',
    'auth.subtitle': 'Ƙirƙiri asusu ko shiga don samun amintaccen kula da dabbobi da kayayyaki, ko ku kasance ƙwararren likitan dabbobi ko ɗan kasuwa.',
    'auth.signIn': 'Shiga',
    'auth.createAccount': 'Ƙirƙiri asusu',
    'auth.registrationType': 'Zaɓi nau’in rajista don ci gaba:',
    'auth.petOwner': 'Mai dabba/Manomi',
    'auth.veterinarian': 'Likitan dabbobi',
    'auth.merchant': 'Ɗan kasuwa',
    'auth.email': 'Adireshin imel',
    'auth.phone': 'Lambar wayar Najeriya ba tare da lambar ƙasa ba',
    'auth.vcn': 'Lambar VCN',
    'auth.password': 'Kalmar sirri',
    'auth.passwordHint': 'Yi amfani da babban harafi, ƙaramin harafi, lamba, da alama ta musamman.',
    'auth.welcomeBack': 'Barka da dawowa! Shiga bayananka don buɗe shafin aikinka.',
    'auth.fillDetails': 'Cika bayananka na sama don farawa.',
    'auth.submitSignIn': 'Shiga',
    'auth.submitSignUp': 'Ƙirƙiri asusu',
    'auth.selectLanguage': 'Zaɓi harshenka',
    'auth.fullName': 'Cikakken suna',
    'auth.vetNameExample': 'Dr. Ibrahim Paul',
    'auth.emailRequired': 'Shigar da imel da kalmar sirri don ci gaba.',
    'auth.invalidPhone': 'Shigar da ingantacciyar lambar wayar Najeriya mai lambobi 10, wadda ta fara da 7, 8, ko 9.',
    'auth.vcnRequired': 'Shigar da lambar VCN don yin rajista a matsayin likitan dabbobi.',
    'settings.account': 'Saitunan asusu',
    'settings.language': 'Harshen manhaja',
    'settings.languageDescription': 'Zaɓi harshen da MVS zai yi amfani da shi.',
    'settings.languageSaved': 'An adana zaɓin harshe.',
    'settings.languageSaveFailed': 'Ba a iya adana zaɓin harshe ba. Sake gwadawa.',
    'settings.editProfile': 'Gyara bayanan martaba',
    'settings.changePassword': 'Canza kalmar sirri',
    'settings.notifications': 'Sanarwa',
    'settings.bankAccount': 'Asusun banki',
    'settings.businessInfo': 'Bayanan kasuwanci',
    'settings.practiceInfo': 'Bayanan asibiti',
    'settings.logOut': 'Fita',
    'settings.deleteAccount': 'Share asusu',
    'profile.title': 'Bayanan martaba na',
    'profile.pets': 'Bayanan dabbobina',
    'profile.farms': 'Bayanan gonaki da dabbobi na',
    'dashboard.practice': 'Shafin aikin asibiti',
    'dashboard.store': 'Shafin kasuwanci',
    'dashboard.managePractice': 'Sarrafa shawarwari da kuɗin shiga',
    'dashboard.manageStore': 'Sarrafa kayayyaki da tallace-tallace',
    'dashboard.consultations': 'Shawarwari',
    'dashboard.overallRating': 'Matsakaicin ƙima',
    'dashboard.totalEarnings': 'Jimillar kuɗin shiga',
    'dashboard.totalSales': 'Jimillar tallace-tallace',
    'dashboard.activeListings': 'Kayayyakin da ke aiki',
    'dashboard.pendingOrders': 'Umarni da ake jira',
    'dashboard.marketplace': 'Babbar kasuwa',
    'dashboard.storeInventory': 'Kayayyakin babbar kasuwa',
    'dashboard.addProduct': 'Ƙara sabon kaya',
    'dashboard.viewDetails': 'Duba bayani',
    'dashboard.proceedToBuy': 'Ci gaba da saye',
    'common.viewProfile': 'Duba bayanan martaba',
    'common.chatWithVet': 'Yi hira da likita',
    'home.hello': 'Sannu, {name}!',
    'home.subtitle': 'Yaya dabbobinku suke yau?',
    'home.askAssistant': 'Tambayi mataimakin AI',
    'home.assistantDescription': 'Samu taimako da shawarar kula da dabbobi cikin sauri.',
    'home.consultVet': 'Tuntuɓi likitan dabbobi yanzu',
    'home.consultDescription': 'Samu shawarar ƙwararre nan take',
    'home.consult': 'Tuntuɓa',
    'home.marketplace': 'Kasuwar saye da sayarwa',
    'home.browseAll': 'Duba duka',
    'common.tryAgain': 'Sake gwadawa',
    'knowledge.title': 'Cibiyar Ilimin MVS',
    'knowledge.viewAll': 'Duba duka',
    'knowledge.search': 'Nemo labarai...',
    'knowledge.all': 'Duka',
    'knowledge.vaccination': 'Rigakafi',
    'knowledge.livestockCare': 'Kula da dabbobin gona',
    'knowledge.hydrationNutrition': 'Ruwa da abinci mai gina jiki',
    'knowledge.firstAid': 'Taimakon farko da tantancewa',
    'knowledge.biosecurity': 'Kariya daga cututtuka',
    'knowledge.publicHealth': 'Lafiyar jama’a',
    'knowledge.noResults': 'Babu labarin da ya dace da bincikenku.',
    'knowledge.closeHub': 'Rufe Cibiyar Ilimin MVS',
    'knowledge.closeArticle': 'Rufe labari',
    'knowledge.gotIt': 'Na fahimta',
  },
  yo: {
    'nav.home': 'Ilé',
    'nav.vets': 'Àwọn oníṣègùn',
    'nav.community': 'Àwùjọ',
    'nav.chat': 'Ìfọ̀rọ̀wérọ̀',
    'nav.chats': 'Àwọn ìfọ̀rọ̀wérọ̀',
    'nav.profile': 'Àkọọ́lẹ̀',
    'nav.dashboard': 'Pẹpẹ iṣẹ́',
    'nav.addProduct': 'Fi ọjà kún un',
    'nav.inventory': 'Ọjà tó wà',
    'auth.eyebrow': 'Iṣẹ́ Ìtọ́jú Ẹranko lórí Fóònù',
    'auth.title': 'Ìtọ́jú ẹran ọ̀sìn tàbí ti oko rẹ bẹ̀rẹ̀ níbí.',
    'auth.subtitle': 'Ṣẹ̀dá àkọọ́lẹ̀ tàbí wọlé láti rí ìtọ́jú ẹranko àti àwọn ohun èlò tó ṣeé gbẹ́kẹ̀ lé, tàbí dara pọ̀ mọ́ wa gẹ́gẹ́ bí dókítà ẹranko tàbí oníṣòwò.',
    'auth.signIn': 'Wọlé',
    'auth.createAccount': 'Ṣẹ̀dá àkọọ́lẹ̀',
    'auth.registrationType': 'Yan irú ìforúkọsílẹ̀ rẹ láti tẹ̀síwájú:',
    'auth.petOwner': 'Olùtọ́jú ẹranko/Àgbẹ̀',
    'auth.veterinarian': 'Dókítà ẹranko',
    'auth.merchant': 'Oníṣòwò',
    'auth.email': 'Àdírẹ́sì ímeèlì',
    'auth.phone': 'Nọ́ńbà fóònù Nàìjíríà láìsí kóòdù orílẹ̀-èdè',
    'auth.vcn': 'Nọ́ńbà VCN',
    'auth.password': 'Ọ̀rọ̀ aṣínà',
    'auth.passwordHint': 'Lo lẹ́tà ńlá, lẹ́tà kékeré, nọ́ńbà, àti àmì pàtàkì kan.',
    'auth.welcomeBack': 'Ẹ kú àbọ̀! Tẹ àlàyé rẹ láti wọ pẹpẹ iṣẹ́ rẹ.',
    'auth.fillDetails': 'Kún àlàyé rẹ lókè láti bẹ̀rẹ̀.',
    'auth.submitSignIn': 'Wọlé',
    'auth.submitSignUp': 'Ṣẹ̀dá àkọọ́lẹ̀',
    'auth.selectLanguage': 'Yan èdè rẹ',
    'auth.fullName': 'Orúkọ kíkún',
    'auth.vetNameExample': 'Dr. Ibrahim Paul',
    'auth.emailRequired': 'Tẹ ímeèlì àti ọ̀rọ̀ aṣínà rẹ láti tẹ̀síwájú.',
    'auth.invalidPhone': 'Tẹ nọ́ńbà fóònù Nàìjíríà oní-nọ́ńbà mẹ́wàá tó bẹ̀rẹ̀ pẹ̀lú 7, 8, tàbí 9.',
    'auth.vcnRequired': 'Tẹ nọ́ńbà VCN rẹ láti forúkọsílẹ̀ gẹ́gẹ́ bí dókítà ẹranko.',
    'settings.account': 'Ètò àkọọ́lẹ̀',
    'settings.language': 'Èdè ìṣàfilọ́lẹ̀',
    'settings.languageDescription': 'Yan èdè tí MVS yóò lò.',
    'settings.languageSaved': 'A ti fi ààyò èdè pamọ́.',
    'settings.languageSaveFailed': 'A kò lè fi ààyò èdè pamọ́. Jọ̀wọ́ tún gbìyànjú.',
    'settings.editProfile': 'Ṣàtúnṣe àkọọ́lẹ̀',
    'settings.changePassword': 'Yí ọ̀rọ̀ aṣínà padà',
    'settings.notifications': 'Àwọn ìfitónilétí',
    'settings.bankAccount': 'Àkọọ́lẹ̀ báǹkì',
    'settings.businessInfo': 'Àlàyé iṣẹ́-ajé',
    'settings.practiceInfo': 'Àlàyé ilé ìwòsàn',
    'settings.logOut': 'Jáde',
    'settings.deleteAccount': 'Pa àkọọ́lẹ̀ rẹ́',
    'profile.title': 'Àkọọ́lẹ̀ mi',
    'profile.pets': 'Àkọsílẹ̀ àwọn ẹranko mi',
    'profile.farms': 'Àkọsílẹ̀ oko àti ẹran mi',
    'dashboard.practice': 'Pẹpẹ ilé ìwòsàn',
    'dashboard.store': 'Pẹpẹ ilé ìtajà',
    'dashboard.managePractice': 'Ṣàkóso ìmọ̀ràn àti owó iṣẹ́',
    'dashboard.manageStore': 'Ṣàkóso ọjà àti títà',
    'dashboard.consultations': 'Àwọn ìmọ̀ràn',
    'dashboard.overallRating': 'Ìwọ̀n ìṣàyẹ̀wò lápapọ̀',
    'dashboard.totalEarnings': 'Àpapọ̀ owó tí a jèrè',
    'dashboard.totalSales': 'Àpapọ̀ títà',
    'dashboard.activeListings': 'Àwọn ọjà tó wà ní títà',
    'dashboard.pendingOrders': 'Àwọn àṣẹ tó ń dúró',
    'dashboard.marketplace': 'Ọjà àgbáyé',
    'dashboard.storeInventory': 'Ọjà tó wà ní ọjà àgbáyé',
    'dashboard.addProduct': 'Fi ọjà tuntun kún un',
    'dashboard.viewDetails': 'Wo àlàyé',
    'dashboard.proceedToBuy': 'Tẹ̀síwájú láti rà á',
    'common.viewProfile': 'Wo àkọọ́lẹ̀',
    'common.chatWithVet': 'Bá dókítà ẹranko sọ̀rọ̀',
    'home.hello': 'Ẹ kú àbọ̀, {name}!',
    'home.subtitle': 'Báwo ni àwọn ẹranko yín ṣe wà lónìí?',
    'home.askAssistant': 'Béèrè lọ́wọ́ olùrànlọ́wọ́ AI',
    'home.assistantDescription': 'Gba ìtọ́sọ́nà kíákíá nípa ìtọ́jú ẹranko.',
    'home.consultVet': 'Bá dókítà ẹranko sọ̀rọ̀ báyìí',
    'home.consultDescription': 'Gba ìmọ̀ràn amọṣẹ́dunjú lẹ́sẹ̀kẹsẹ̀',
    'home.consult': 'Bá sọ̀rọ̀',
    'home.marketplace': 'Ọjà',
    'home.browseAll': 'Wo gbogbo rẹ̀',
    'common.tryAgain': 'Tún gbìyànjú',
    'knowledge.title': 'Ile-iṣẹ́ Ìmọ̀ MVS',
    'knowledge.viewAll': 'Wo gbogbo rẹ̀',
    'knowledge.search': 'Wá àwọn àpilẹ̀kọ...',
    'knowledge.all': 'Gbogbo rẹ̀',
    'knowledge.vaccination': 'Àjẹsára',
    'knowledge.livestockCare': 'Ìtọ́jú ẹran ọ̀sìn',
    'knowledge.hydrationNutrition': 'Omi àti oúnjẹ',
    'knowledge.firstAid': 'Ìrànlọ́wọ́ àkọ́kọ́ àti ìṣàyẹ̀wò',
    'knowledge.biosecurity': 'Ìdènà àrùn',
    'knowledge.publicHealth': 'Ìlera gbogbo ènìyàn',
    'knowledge.noResults': 'Kò sí àpilẹ̀kọ tó bá ìwá yìí mu.',
    'knowledge.closeHub': 'Pa Ile-iṣẹ́ Ìmọ̀ MVS',
    'knowledge.closeArticle': 'Pa àpilẹ̀kọ',
    'knowledge.gotIt': 'Mo gbọ́',
  },
  ig: {
    'nav.home': 'Ụlọ',
    'nav.vets': 'Ndị dọkịta anụmanụ',
    'nav.community': 'Obodo',
    'nav.chat': 'Mkparịta ụka',
    'nav.chats': 'Mkparịta ụka',
    'nav.profile': 'Profaịlụ',
    'nav.dashboard': 'Ogwe ọrụ',
    'nav.addProduct': 'Tinye ngwaahịa',
    'nav.inventory': 'Ngwaahịa dị',
    'auth.eyebrow': 'Ọrụ Nlekọta Anụmanụ Ekwentị',
    'auth.title': 'Nlekọta anụ ụlọ ma ọ bụ anụ ugbo gị na-amalite ebe a.',
    'auth.subtitle': 'Mepụta akaụntụ ma ọ bụ banye iji nweta nlekọta anụmanụ na ihe eji arụ ọrụ a pụrụ ịtụkwasị obi, ma ọ bụ sonye dịka dọkịta anụmanụ ma ọ bụ onye ahịa.',
    'auth.signIn': 'Banye',
    'auth.createAccount': 'Mepụta akaụntụ',
    'auth.registrationType': 'Họrọ ụdị ndebanye aha gị ka ị gaa n’ihu:',
    'auth.petOwner': 'Onye nwe anụ/Onye ọrụ ugbo',
    'auth.veterinarian': 'Dọkịta anụmanụ',
    'auth.merchant': 'Onye ahịa',
    'auth.email': 'Adreesị ozi-e',
    'auth.phone': 'Nọmba ekwentị Naịjirịa na-enweghị koodu obodo',
    'auth.vcn': 'Nọmba VCN',
    'auth.password': 'Okwuntughe',
    'auth.passwordHint': 'Jiri mkpụrụedemede ukwu, obere, nọmba na akara pụrụ iche.',
    'auth.welcomeBack': 'Nnọọ ọzọ! Tinye ozi nbanye gị ka ị nweta ogwe ọrụ gị.',
    'auth.fillDetails': 'Dejupụta ozi dị n’elu ka ịmalite.',
    'auth.submitSignIn': 'Banye',
    'auth.submitSignUp': 'Mepụta akaụntụ',
    'auth.selectLanguage': 'Họrọ asụsụ gị',
    'auth.fullName': 'Aha zuru ezu',
    'auth.vetNameExample': 'Dr. Ibrahim Paul',
    'auth.emailRequired': 'Tinye ozi-e na okwuntughe gị ka ị gaa n’ihu.',
    'auth.invalidPhone': 'Tinye nọmba ekwentị Naịjirịa ziri ezi nwere mkpụrụọnụọgụ iri, malite na 7, 8, ma ọ bụ 9.',
    'auth.vcnRequired': 'Tinye nọmba VCN gị iji debanye aha dịka dọkịta anụmanụ.',
    'settings.account': 'Ntọala akaụntụ',
    'settings.language': 'Asụsụ ngwa',
    'settings.languageDescription': 'Họrọ asụsụ MVS ga-eji.',
    'settings.languageSaved': 'Echekwara nhọrọ asụsụ gị.',
    'settings.languageSaveFailed': 'Enweghị ike ichekwa asụsụ gị. Biko nwaa ọzọ.',
    'settings.editProfile': 'Dezie profaịlụ',
    'settings.changePassword': 'Gbanwee okwuntughe',
    'settings.notifications': 'Ọkwa ozi',
    'settings.bankAccount': 'Akaụntụ ụlọ akụ',
    'settings.businessInfo': 'Ozi azụmahịa',
    'settings.practiceInfo': 'Ozi ụlọ ọgwụ',
    'settings.logOut': 'Pụọ',
    'settings.deleteAccount': 'Hichapụ akaụntụ',
    'profile.title': 'Profaịlụ m',
    'profile.pets': 'Ndekọ anụ ụlọ m',
    'profile.farms': 'Ndekọ ugbo na anụ ụlọ m',
    'dashboard.practice': 'Ogwe ọrụ ụlọ ọgwụ',
    'dashboard.store': 'Ogwe ọrụ ụlọ ahịa',
    'dashboard.managePractice': 'Jikwaa ndụmọdụ na ego a na-enweta',
    'dashboard.manageStore': 'Jikwaa ngwaahịa na ire ahịa gị',
    'dashboard.consultations': 'Ndụmọdụ',
    'dashboard.overallRating': 'Ntụle n’ozuzu',
    'dashboard.totalEarnings': 'Ngụkọta ego enwetara',
    'dashboard.totalSales': 'Ngụkọta ahịa',
    'dashboard.activeListings': 'Ngwaahịa ndị dị ire',
    'dashboard.pendingOrders': 'Iwu ndị na-eche',
    'dashboard.marketplace': 'Ahịa zuru ụwa ọnụ',
    'dashboard.storeInventory': 'Ngwaahịa ahịa zuru ụwa ọnụ',
    'dashboard.addProduct': 'Tinye ngwaahịa ọhụrụ',
    'dashboard.viewDetails': 'Lee nkọwa',
    'dashboard.proceedToBuy': 'Gaa n’ihu ịzụta',
    'common.viewProfile': 'Lee profaịlụ',
    'common.chatWithVet': 'Soro dọkịta anụmanụ kparịta ụka',
    'home.hello': 'Ndewo, {name}!',
    'home.subtitle': 'Kedu ka anụ ụlọ gị dị taa?',
    'home.askAssistant': 'Jụọ onye enyemaka AI',
    'home.assistantDescription': 'Nweta nduzi ngwa ngwa gbasara nlekọta anụmanụ.',
    'home.consultVet': 'Kpọtụrụ dọkịta anụmanụ ugbu a',
    'home.consultDescription': 'Nweta ndụmọdụ ọkachamara ozugbo',
    'home.consult': 'Kpọtụrụ',
    'home.marketplace': 'Ahịa',
    'home.browseAll': 'Lee ha niile',
    'common.tryAgain': 'Nwaa ọzọ',
    'knowledge.title': 'Ebe Ọmụma MVS',
    'knowledge.viewAll': 'Lee ha niile',
    'knowledge.search': 'Chọọ akụkọ...',
    'knowledge.all': 'Ha niile',
    'knowledge.vaccination': 'Ịgba ọgwụ mgbochi',
    'knowledge.livestockCare': 'Nlekọta anụ ụlọ ugbo',
    'knowledge.hydrationNutrition': 'Mmiri na nri',
    'knowledge.firstAid': 'Enyemaka mbụ na nyocha',
    'knowledge.biosecurity': 'Mgbochi ọrịa',
    'knowledge.publicHealth': 'Ahụike ọha',
    'knowledge.noResults': 'Ọ dịghị akụkọ dabara na ọchụchọ gị.',
    'knowledge.closeHub': 'Mechie Ebe Ọmụma MVS',
    'knowledge.closeArticle': 'Mechie akụkọ',
    'knowledge.gotIt': 'Aghọtala m',
  },
};

type LanguageContextValue = {
  language: AppLanguage;
  ready: boolean;
  selectLanguage: (language: AppLanguage) => Promise<void>;
  applyAccountLanguage: (language: AppLanguage) => Promise<void>;
  t: (key: string, values?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const isAppLanguage = (value: unknown): value is AppLanguage =>
  value === 'en' || value === 'ha' || value === 'yo' || value === 'ig';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then((savedLanguage) => {
      if (mounted && isAppLanguage(savedLanguage)) setLanguageState(savedLanguage);
    }).catch((error) => {
      console.warn('[Language] Could not load the saved language:', error);
    }).finally(() => {
      if (mounted) setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  const applyAccountLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch (error) {
      console.error('[Language] Could not save the local language preference:', error);
      throw error;
    }
  }, []);

  const selectLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    const previousLanguage = language;
    setLanguageState(nextLanguage);
    try {
      const { data: { session }, error: userError } = await supabase.auth.getSession();
      if (userError) throw userError;
      if (session?.user) {
        const { error } = await supabase
          .from('profiles')
          .update({ preferred_language: nextLanguage })
          .eq('id', session.user.id);
        if (error) throw error;
      }
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch (error) {
      setLanguageState(previousLanguage);
      console.error('[Language] Could not save the language preference:', error);
      throw error;
    }
  }, [language]);

  const t = useCallback((key: string, values?: Record<string, string>) => {
    let message = translations[language][key] ?? translations.en[key] ?? key;
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        message = message.replaceAll(`{${name}}`, value);
      }
    }
    return message;
  }, [language]);

  const value = useMemo(() => ({ language, ready, selectLanguage, applyAccountLanguage, t }), [
    language, ready, selectLanguage, applyAccountLanguage, t,
  ]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider.');
  return context;
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return isAppLanguage(value) ? value : 'en';
}

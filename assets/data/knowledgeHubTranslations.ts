import type { AppLanguage } from '../../lib/language';

type ArticleTranslation = {
  title: string;
  summary: string;
  content: string[];
};

export const knowledgeHubTranslations: Partial<Record<AppLanguage, Record<string, ArticleTranslation>>> = {
  ha: {
    'dog-vaccination': {
      title: 'Jagorar Rigakafin Kare',
      summary: 'Jadawalin muhimman rigakafi da sauran alluran kare domin kare lafiyarsa.',
      content: [
        'Rigakafi yana daga cikin manyan hanyoyin kare karnuka daga cututtuka masu yaɗuwa da haɗari. Allurar rigakafi tana taimaka wa garkuwar jiki ta samar da kariya ba tare da jawo cutar ba.',
        'Muhimman alluran kare a Najeriya da Afirka ta Yamma sun haɗa da ta cutar hauka (rabies), distemper, parvovirus, hepatitis na kare da leptospirosis (DHPP/DHLPP). Rabies na iya yaɗuwa ga mutane kuma yana da illa sosai; a bi dokokin yankinku.',
        'A kan fara wa ’yan kwikwiyo allura daga makonni 6 zuwa 8, sannan a maimaita bayan kowane makonni 3 zuwa 4 har kusan makonni 16. Karnukan da suka girma suna buƙatar ƙarin allura duk shekara 1 zuwa 3 bisa shawarar likitan dabbobi da irin allurar.',
        'Bayan allura, kasala kaɗan ko ciwon wurin allura na tsawon awa 24 zuwa 48 na iya faruwa. Idan fuska ta kumbura, kuraje suka bayyana, amai ya faru ko kasalar ta yi tsanani, a tuntubi likitan dabbobi nan da nan.',
      ],
    },
    'cat-vaccination': {
      title: 'Jagorar Rigakafin Mage',
      summary: 'Muhimman alluran rigakafin panleukopenia, calicivirus da rabies ga mage.',
      content: [
        'Allurar rigakafi na kare mage daga cututtukan ƙwayoyin cuta masu yaɗuwa. Ko mage mai zama a gida kaɗai tana buƙatar rigakafi, domin ƙwayoyin cuta na iya shigowa ta iska, takalma ko tufafi.',
        'Muhimman alluran mage suna kare ta daga panleukopenia, rhinotracheitis na mage (FVR), calicivirus (FCV) da rabies. Panleukopenia na iya jawo matsananciyar rashin ruwa da mutuwar ’yan mage.',
        'A kan fara wa ’yan mage allura daga makonni 6 zuwa 8, a maimaita bayan kowane makonni 3 zuwa 4 har zuwa makonni 16. Ana ba da ƙarin allura bayan shekara guda, sannan bisa shawarar likitan dabbobi duk shekara 1 zuwa 3.',
        'A riƙa rubuta duk alluran da aka yi wa mage, musamman kafin kai ta wurin reno. Likitan dabbobi zai tsara alluran da suka dace da inda take zama da haɗarin kamuwa da cuta.',
      ],
    },
    'poultry-vaccination': {
      title: 'Jadawalin Rigakafin Kaji',
      summary: 'Kare garken kaji daga Newcastle, Gumboro da fowl pox.',
      content: [
        'Rigakafi ginshiƙi ne na kiwon kaji mai nasara. Cututtuka masu saurin yaɗuwa na iya bazuwa cikin garke cikin sa’o’i, su jawo mutuwar kaji da asarar kuɗi.',
        'Muhimman alluran sun haɗa da Newcastle (ND), Gumboro (IBD), fowl pox, Marek da infectious bronchitis. Newcastle na iya kashe kusan duk kajin da ba a yi wa rigakafi ba.',
        'Jadawalin ya danganta da shekarun kaji: ana ba da allurar Marek a ranar ƙyanƙyashe, Gumboro yawanci ta ruwan sha a makonni na 1 da 3, sannan Newcastle daga rana ta 7 tare da maimaitawa. A kiyaye allurai cikin sanyi yadda ya kamata.',
        'Jadawalin ya bambanta bisa nau’in kaji da yankin da ake kiwo. A tuntubi likitan dabbobi kafin amfani da jadawali. A haɗa rigakafi da tsaftar rumfa, tsaftataccen abinci da matakan hana yaɗuwar cuta.',
      ],
    },
    'clean-water-nutrition': {
      title: 'Ruwa Mai Tsabta da Lafiyar Dabbobi',
      summary: 'Muhimmancin ruwa mai tsabta ga dabbobin gida da na gona.',
      content: [
        'Ruwa yana da matuƙar muhimmanci ga dabbobin gida da na gona. Rashin kashi 10% na ruwan jiki na iya jawo matsalar gabobi, bugun zafi ko mutuwa. Ruwa yana taimaka wa narkewar abinci, shan sinadarai masu gina jiki da daidaita zafin jiki.',
        'A samar da ruwa sabo kuma marar gurɓatawa. Ruwa marar motsi, mai algae ko sinadarai na iya ɗauke da E. coli, Salmonella da ƙwayoyin cututtuka. Gurbataccen ruwan kaji da aladu na rage amfani da abinci kuma yana jawo matsalar ciki.',
        'A wanke kwanon ruwa ko bututun sha kullum. A wuraren zafi, a ajiye ruwan a inuwa domin dabbobi su sha isasshe kuma kada su kamu da matsanancin zafi.',
        'A tabbatar dabbobi suna samun ruwa kullum. Idan sun fara shan ruwa da yawa ko suka ƙi sha, a tuntubi likitan dabbobi; hakan na iya nuna cutar koda, ciwon sukari ko wata cuta.',
      ],
    },
    'ruminant-health-deworming': {
      title: 'Lafiyar Shanu da Rage Tsutsotsi',
      summary: 'Hanyoyin rage tsutsotsi da kare shanu, awaki da tumaki daga ƙwayoyin cuta.',
      content: [
        'Tsutsotsi da sauran ƙwayoyin cuta na cikin manyan barazanar kiwon shanu, awaki da tumaki a Afirka ta Yamma. Suna iya jawo ƙarancin jini, ramewa, raguwar nono da mutuwa, musamman ga ’ya’ya.',
        'A tsara maganin tsutsotsi a muhimman lokutan shekara, musamman farkon da ƙarshen damina. Yin magani akai-akai ba tare da bukata ba na sa magunguna su daina aiki; likitan dabbobi zai taimaka wajen zaɓar lokacin magani bisa alamomi ko gwajin bayan gida.',
        'A juya wuraren kiwo domin ciyawa ta huta kuma a rage yaɗuwar tsutsotsi. Guji kai dabbobi kiwo a ciyawa mai jika da sassafe, inda tsutsotsi kan manne.',
        'A yi amfani da maganin kaska da likitan dabbobi ya amince da shi. A bi lokacin da ya kamata a jira kafin a sha nono ko a yanka dabba bayan magani.',
      ],
    },
    'pet-nutrition-feeding': {
      title: 'Abincin Dabbobin Gida Mai Aminci',
      summary: 'Ka’idojin abinci mai kyau da abubuwan gida masu guba ga karnuka da mage.',
      content: [
        'Abinci mai daidaito kuma wanda ya dace da nau’in dabba yana taimaka mata ta kasance cikin koshin lafiya. Kare yana buƙatar furotin, kitse, sinadaran carbohydrates, bitamin da ma’adanai; mage kuma tana buƙatar furotin mai yawa da taurine.',
        'Albasa, tafarnuwa da leek na iya lalata jajayen ƙwayoyin jini su jawo ƙarancin jini. Cakulan, kofi da abubuwan caffeine na iya jawo bugun zuciya ba daidai ba ko farfaɗiya.',
        'Inabi da zabibi na iya jawo gazawar koda; ƙasusuwan dafaffen nama na iya tsagewa su ji wa hanji rauni; xylitol da ke cikin wasu kayan zaƙi na iya rage sukari a jini da lalata hanta. Kada a ba dabbobi waɗannan abinci.',
        'A ba da abinci a lokuta na yau da kullum, kada a barshi a gabansu kullum, domin hakan na iya jawo kiba. Idan za a canza abinci, a gauraya sabon abincin a hankali cikin kwanaki 7 zuwa 10.',
      ],
    },
    'canine-emergency-first-aid': {
      title: 'Taimakon Farko ga Kare a Gaggawa',
      summary: 'Gane alamun haɗari da taimaka wa dabba kafin kai ta wurin likita.',
      content: [
        'Gane gaggawar lafiya da ba da taimakon farko na iya ceton dabbar gida. Misalan haɗari sun haɗa da mummunan rauni, zargin guba, bugun zafi, kumburin ciki da parvovirus.',
        'Idan kare ya kamu da bugun zafi—numfashi da sauri, gumis ja sosai, yau ko ya faɗi—kai shi inuwa ko wuri mai sanyaya iska. Shafa masa ruwan sanyi amma ba ƙanƙara ba a ciki, tafin ƙafa da wuya yayin kai shi asibitin dabbobi. Ruwan ƙanƙara na iya tsananta matsalar.',
        'Idan yana zubar da jini, matsa masa da kyalle mai tsabta ko gauze. Kada a ɗaure masa igiya mai matse jini sai likitan dabbobi ya umarta. A kwantar da dabbar kuma a hana ta motsi sosai.',
        'Idan kana zargin ta haɗiye guba, kada ka sa ta yi amai sai likitan dabbobi ya ce. Wasu sinadarai na ƙara lalata makogwaro idan an yi amai. Kai kwalin ko kunshin abin da ta haɗiye zuwa asibiti.',
      ],
    },
    'poultry-biosecurity': {
      title: 'Kariyar Kaji daga Cututtuka',
      summary: 'Tsafta, kashe ƙwayoyin cuta da keɓewa domin dakatar da yaɗuwar cuta.',
      content: [
        'Kariyar garke na nufin matakan hana shigowa da yaɗuwar ƙwayoyin cuta a wurin kiwon kaji. Tsarin kariya mai kyau yakan fi arha fiye da magance barkewar cuta.',
        'A yi shinge, a rage zirga-zirgar mutane, kuma a sanya wurin tsabtace takalma da na wanke hannu a ƙofar kowace rumfa. Baƙi da ma’aikata su sa takalma da tufafin aiki masu tsabta.',
        'Tsuntsayen daji, beraye da dabbobin da suka ɓata na iya yaɗa mura ta tsuntsaye da Salmonella. A adana abinci a wurin da beraye ba sa shiga, a share zubewar abinci da sauri, sannan a rufe ramukan iska da raga.',
        'Idan zai yiwu, a yi tsarin shigar da garke duka tare da fitar da su duka tare. Bayan an fitar da garke, a tsaftace kuma a kashe ƙwayoyin cuta a rumfa, sannan a bar ta aƙalla kwanaki 14 kafin kawo sababbin kaji.',
      ],
    },
    'rabies-public-health': {
      title: 'Sanin Cutar Rabies da Kariyarta',
      summary: 'Yadda rabies ke yaɗuwa, rigakafi da abin yi bayan cizo.',
      content: [
        'Rabies cuta ce mai saurin kisa wadda ke shafar kwakwalwar dabbobi masu shayarwa, har da mutane. Yawanci tana yaɗuwa ta yau bayan cizo ko karce, ko idan yau ya taɓa buɗaɗɗen rauni ko ido da baki.',
        'Yin wa karnuka da mage allurar rabies kowace shekara na daga cikin hanyoyin kare mutane mafi inganci. A wurare da yawa doka ta wajabta rigakafin dabbobin gida domin kare lafiyar jama’a.',
        'Idan dabba da ake zargin tana da rabies ta ciji mutum ko dabba, a wanke wurin cizon da sabulu da ruwan famfo na aƙalla minti 15 nan da nan. Wannan na taimaka wajen rage ƙwayoyin cuta a wurin raunin.',
        'A nemi taimakon likita nan da nan domin a fara rigakafin bayan kamuwa (PEP) kafin alamun cuta su bayyana. Bayan bayyanar alamun rabies, cutar kusan kullum tana kisa. A nemi likitan dabbobi cikin gaggawa.',
      ],
    },
    'toxoplasmosis-feline-public-health': {
      title: 'Toxoplasmosis da Kariyar Mage',
      summary: 'Yadda Toxoplasma gondii ke yaɗuwa, haɗarin ciki da hanyoyin kariya.',
      content: [
        'Toxoplasmosis cuta ce da ƙwayar Toxoplasma gondii ke jawo wa. Mage ita ce dabbar da ƙwayar cutar ke hayayyafa a cikinta kuma tana fitar da ƙwai a bayan gida; mutane da sauran dabbobi ma na iya kamuwa.',
        'Mage da manya masu lafiya ba sa nuna alamu ko kuma suna da alamun mura kaɗan. Amma cutar na da haɗari ga mata masu ciki da masu raunin garkuwar jiki. Idan mace ta kamu da cutar a karon farko tana da ciki, ƙwayar cutar na iya ketare mahaifa.',
        'Cutar na iya jawo matsanancin lahani ga jariri, matsalar kwakwalwa ko gani, jinkirin girma ko zubar da ciki. Mutane kan kamu ta akwatin kashin mage, ƙasa ko kayan lambu marasa wankewa, ko nama da ba a dafa sosai ba.',
        'Ba lallai ba ne a rabu da mage. Mace mai ciki ta bar wani ya tsaftace akwatin kashi kullum; idan ba haka ba, ta sa safar hannu ta wanke hannu sosai da sabulu da ruwan ɗumi. A cire kashi kullum domin ƙwayoyin cuta na buƙatar kwana 1 zuwa 5 kafin su zama masu yaɗuwa.',
      ],
    },
    'anthrax-ruminant-public-health': {
      title: 'Gargadin Anthrax da Kariyar Garke',
      summary: 'Gane anthrax, kula da mutuwar dabba kwatsam da matakan gaggawa.',
      content: [
        'Anthrax cuta ce mai tsanani da ƙwayar Bacillus anthracis ke jawo wa. Tana shafar shanu, tumaki da awaki, kuma tana iya kashe su cikin sauri. Ƙwayoyin cutar na iya rayuwa a ƙasa tsawon shekaru, dabbobi kuma na iya haɗiye su yayin kiwo.',
        'Dabbobi kan mutu ba tare da an ga alamun rashin lafiya ba. Muhimmin alama ita ce jini mai duhu da ba ya daskarewa yana fitowa daga hanci, baki ko dubura, tare da saurin ruɓewar gawar.',
        'GARGADIN TSARO MAI MUHIMMANCI: Idan ka ga dabbar da ta mutu tana zubar da jini mai duhu wanda bai daskare ba, KADA KA BUƊE KO YANKE GAWAR. Buɗe gawar na iya fitar da ƙwayoyin cuta su gurɓata ƙasa na tsawon shekaru.',
        'Kada a yanka, sayar, taɓa, fere ko cin naman dabbar da ake zargin anthrax ce ta kashe. Keɓe wurin, nisanta mutane da karnuka, sannan a kira likitan dabbobi da jami’an lafiyar jama’a domin su tsara zubar da gawar da rigakafin garke.',
      ],
    },
  },
  yo: {
    'dog-vaccination': {
      title: 'Ìtọ́sọ́nà Àjẹsára Ajá',
      summary: 'Àkókò àjẹsára pàtàkì àti àfikún láti dáàbò bo ìlera ajá.',
      content: [
        'Àjẹsára jẹ́ ọ̀kan lára àwọn ọ̀nà pàtàkì láti dáàbò bo ajá lọ́wọ́ àrùn tó lè ràn án àti tó léwu. Ó ń kọ́ ètò ààbò ara láti dáàbò bo ara láì fa àrùn náà.',
        'Àwọn àjẹsára pàtàkì fún ajá ní Nàìjíríà àti Ìwọ̀ Oòrùn Áfíríkà ni Rabies, Canine Distemper, Parvovirus, Canine Hepatitis àti Leptospirosis (DHPP/DHLPP). Rabies lè ràn ènìyàn, ó sì léwu gan-an; tẹ̀lé òfin agbègbè yín.',
        'A máa ń bẹ̀rẹ̀ àjẹsára ọmọ ajá ní ọ̀sẹ̀ 6 sí 8, a sì tún un ṣe ní gbogbo ọ̀sẹ̀ 3 sí 4 títí ó fi tó ọ̀sẹ̀ 16. Ajá àgbà nílò àfikún ní gbogbo ọdún 1 sí 3, gẹ́gẹ́ bí ìmọ̀ràn dókítà ẹranko àti irú àjẹsára.',
        'Àárẹ̀ díẹ̀ tàbí ìrora níbi abẹ́rẹ́ fún wákàtí 24 sí 48 lè ṣẹlẹ̀. Bí ojú bá wú, àkùnyàn bá yọ, ìgbagbogbo bá wà tàbí àárẹ̀ bá le, pe dókítà ẹranko lẹ́sẹ̀kẹsẹ̀.',
      ],
    },
    'cat-vaccination': {
      title: 'Ìtọ́sọ́nà Àjẹsára Ológbò',
      summary: 'Àjẹsára pàtàkì lòdì sí Panleukopenia, Calicivirus àti Rabies fún ológbò.',
      content: [
        'Àjẹsára ológbò ń dáàbò bo ó lọ́wọ́ àrùn fáírọ́ọ̀sì tó ń tàn. Àní ológbò tó ń gbé inú ilé nìkan nílò àjẹsára, nítorí kòkòrò àrùn lè wọlé láti inú afẹ́fẹ́, bàtà tàbí aṣọ.',
        'Àjẹsára pàtàkì ń dáàbò bo ológbò lọ́wọ́ Feline Panleukopenia, Feline Viral Rhinotracheitis (FVR), Feline Calicivirus (FCV) àti Rabies. Panleukopenia lè fa àìgbẹ́ omi tó le àti ikú àwọn ọmọ ológbò.',
        'A máa ń bẹ̀rẹ̀ àjẹsára ọmọ ológbò ní ọ̀sẹ̀ 6 sí 8, a sì tún un ṣe ní gbogbo ọ̀sẹ̀ 3 sí 4 títí ó fi tó ọ̀sẹ̀ 16. A máa ń fún un ní àfikún lẹ́yìn ọdún kan, lẹ́yìn náà gẹ́gẹ́ bí dókítà ẹranko ṣe dámọ̀ràn.',
        'Kọ gbogbo àjẹsára tí ológbò bá gbà sílẹ̀, pàápàá kí o tó gbé e sí ibi ìtọ́jú ẹranko. Dókítà ẹranko yóò yan ètò tó bá ibi tí ó ń gbé àti ewu àrùn mu.',
      ],
    },
    'poultry-vaccination': {
      title: 'Ètò Àjẹsára Adìẹ',
      summary: 'Dáàbò bo agbo adìẹ lọ́wọ́ Newcastle, Gumboro àti Fowl Pox.',
      content: [
        'Àjẹsára ni ìpìlẹ̀ ìtọ́jú adìẹ tó dára. Àrùn tó ń tàn yára lè gba gbogbo agbo adìẹ láàárín wákàtí díẹ̀, tó sì lè fa ikú àti ìpàdánù owó.',
        'Àwọn àjẹsára pàtàkì ni Newcastle (ND), Gumboro (IBD), Fowl Pox, Marek àti Infectious Bronchitis. Newcastle lè pa gbogbo adìẹ tí kò gba àjẹsára.',
        'Àkókò àjẹsára dá lórí ọjọ́ orí adìẹ: a máa ń fún Marek ní ọjọ́ tí ó bá ṣẹ̀ṣẹ̀ yọ, Gumboro sábà máa ń gba inú omi ní ọ̀sẹ̀ 1 àti 3, Newcastle sì máa ń bẹ̀rẹ̀ ní ọjọ́ 7 pẹ̀lú àfikún. Pa àjẹsára mọ́ ní òtútù tó yẹ.',
        'Ètò àjẹsára yàtọ̀ sí irú adìẹ àti agbègbè. Bá dókítà ẹranko sọ̀rọ̀ kí o tó bẹ̀rẹ̀ ètò kan. Máa pa ilé adìẹ mọ́, jẹ́ kí oúnjẹ mọ́, kí o sì lo àwọn ọ̀nà ìdènà àrùn.',
      ],
    },
    'clean-water-nutrition': {
      title: 'Omi Mímọ́ àti Ìlera Ẹranko',
      summary: 'Ìdí tí omi mímọ́ fi ṣe pàtàkì fún ẹranko ilé àti ẹran ọ̀sìn.',
      content: [
        'Omi ṣe pàtàkì gan-an fún ẹranko ilé àti ẹran ọ̀sìn. Pípàdánù 10% omi ara lè ba àwọn ẹ̀yà ara jẹ́, fa ìgbóná ara tàbí ikú. Omi ń ṣèrànwọ́ fún jíjẹ oúnjẹ àti ìṣàkóso ooru ara.',
        'Pèsè omi tuntun tí kò ní èérí. Omi tó dúró, tó ní algae tàbí kẹ́míkà lè ní E. coli, Salmonella àti kòkòrò àrùn mìíràn. Omi ẹlẹ́gbin lè ba jíjẹ oúnjẹ adìẹ àti ẹlẹ́dẹ̀ jẹ́, ó sì lè fa àìsàn inú.',
        'Fọ àwo omi tàbí ohun èlò mímu mọ́ lójoojúmọ́. Ní ibi tó gbóná, fi omi sí ibìji kí ẹranko lè mu tó, kí ooru àpọ̀jù má sì kọlù wọ́n.',
        'Rí i dájú pé ẹranko ní omi mímu ní gbogbo ìgbà. Bí wọ́n bá ń mu omi jù tàbí tí wọ́n bá kọ̀ láti mu, bá dókítà ẹranko sọ̀rọ̀; ó lè jẹ́ àmì àìsàn kidinrin, àtọ̀gbẹ̀ tàbí àkóràn.',
      ],
    },
    'ruminant-health-deworming': {
      title: 'Ìlera Ẹran Àjẹjẹ àti Ìdènà Kòkòrò',
      summary: 'Ọ̀nà ìdènà kòkòrò fún màlúù, ewúrẹ́ àti àgùntàn.',
      content: [
        'Kòkòrò inú àti àwọn kòkòrò mìíràn jẹ́ ewu ńlá sí màlúù, ewúrẹ́ àti àgùntàn ní Ìwọ̀ Oòrùn Áfíríkà. Wọ́n lè fa ẹ̀jẹ̀ díẹ̀, sísùn ara, dídín wàrà kù àti ikú, pàápàá fún àwọn ọmọ ẹranko.',
        'Ṣètò ìtọ́jú kòkòrò ní àkókò pàtàkì ọdún, pàápàá ní ìbẹ̀rẹ̀ àti òpin òjò. Lílo oògùn nígbà gbogbo láìnídìí lè mú kí kòkòrò má dáhùn sí oògùn; dókítà ẹranko lè ran ọ́ lọ́wọ́ láti yan àkókò tó yẹ.',
        'Yí ibi ìjẹko padà kí koríko lè sinmi, kí ìyípo ìgbésí ayé kòkòrò sì bàjẹ́. Má ṣe mú ẹran lọ jẹ koríko tó tutù ní kùtùkùtù òwúrọ̀, nítorí kòkòrò lè wà lára rẹ̀.',
        'Lo oògùn ìdènà àmùrè tí dókítà ẹranko fọwọ́ sí. Tẹ̀lé àkókò ìdúró tí a béèrè kí ẹran tó lè jẹ ẹran náà tàbí kí ènìyàn tó mu wàrà rẹ̀ lẹ́yìn ìtọ́jú.',
      ],
    },
    'pet-nutrition-feeding': {
      title: 'Oúnjẹ Ọsin tó Dára àti Tó Ní Ààbò',
      summary: 'Ìtọ́sọ́nà oúnjẹ tó yẹ àti oúnjẹ ilé tó lè jẹ́ májèlé fún ajá àti ológbò.',
      content: [
        'Oúnjẹ tó péye tí ó sì bá irú ẹranko mu ń ṣètìlẹ́yìn fún ìlera àti gígùn ayé. Ajá nílò protein, ọ̀rá tó dára, carbohydrate, vitamin àti mineral; ológbò nílò protein púpọ̀ àti taurine.',
        'Alubosa, ata ilẹ̀ àti leek lè ba sẹ́ẹ̀lì ẹ̀jẹ̀ pupa jẹ́, kí ẹ̀jẹ̀ sì dín kù. Chocolate, kọfí àti ohun tó ní caffeine lè fa ìlù-ọkàn àìtọ́ tàbí ìgbọ̀nwọ́n.',
        'Àjàrà àti raisin lè ba kidinrin jẹ́; egungun ẹran tí a sè lè fọ́ kí ó sì ṣe ìpalára fún ìfun; xylitol tó wà nínú àwọn ohun adùn lè dín ṣúgà ẹ̀jẹ̀ kù, kí ó sì ba ẹ̀dọ̀ jẹ́. Má ṣe fún ẹranko ní wọ̀nyí.',
        'Fún ẹranko ní oúnjẹ ní àkókò déédéé dípò fífi sílẹ̀ ní gbogbo ìgbà, kí wọ́n má bàa sanra jù. Bí o bá fẹ́ yí oúnjẹ padà, da tuntun pọ̀ mọ́ ti tẹ́lẹ̀ díẹ̀díẹ̀ fún ọjọ́ 7 sí 10.',
      ],
    },
    'canine-emergency-first-aid': {
      title: 'Ìrànlọ́wọ́ Kíákíá fún Ajá',
      summary: 'Ṣàkíyèsí àmì ewu kí o sì ran ẹranko lọ́wọ́ kí o tó dé ọ̀dọ̀ dókítà.',
      content: [
        'Mímọ àmì pajawiri àti fífún ẹranko ní ìrànlọ́wọ́ àkọ́kọ́ lè gba ẹ̀mí rẹ̀ là. Àwọn pajawiri ni ìfarapa tó le, májèlé, ìgbóná ara, ìwúfù inú àti Parvovirus.',
        'Bí ajá bá ní ìgbóná ara—ó ń mí sókè, gọ́ọ̀mù rẹ̀ pupa dúdú, ó ń tutọ́ tàbí ó ṣubú—gbé e lọ sí ibìji tàbí yàrá tó ní afẹ́fẹ́ tútù. Lo omi tútù, kì í ṣe omi yìnyín, sí ikùn, ẹsẹ̀ àti ọrùn rẹ̀ nígbà tí o bá ń gbé e lọ sí ilé ìwòsàn ẹranko.',
        'Bí ó bá ń jóná, tẹ aṣọ mímọ́ tàbí gauze mọ́ ibi náà. Má ṣe di ẹsẹ̀ mọ́lẹ̀ gan-an àfi bí ògbógi bá sọ bẹ́ẹ̀. Jẹ́ kí ẹranko balẹ̀, kí o sì dín ìrìn rẹ̀ kù.',
        'Bí o bá rò pé ó ti jẹ májèlé, má ṣe mú un bì àfi bí dókítà ẹranko bá pàṣẹ. Àwọn kẹ́míkà kan lè tún ba ọ̀fun jẹ́ nígbà ìgbagbogbo. Mú àpò tàbí ìgò májèlé náà lọ sí ilé ìwòsàn.',
      ],
    },
    'poultry-biosecurity': {
      title: 'Ìdènà Àrùn fún Adìẹ',
      summary: 'Ìmọ́tótó oko, ìfọ̀mọ́ àti ìyàsọ́tọ̀ láti dá ìtànkálẹ̀ àrùn dúró.',
      content: [
        'Ìdènà àrùn ni gbogbo ìgbésẹ̀ tó ń dènà ìwọlé àti ìtànkálẹ̀ kòkòrò àrùn sínú agbo adìẹ. Ètò tó lágbára máa ń ná owó díẹ̀ ju gbígbìyànjú láti tọ́jú àrùn tó ti tàn ká lọ.',
        'Fi odi yí oko ká, ṣàkóso ìrìnàjò, kí o sì fi ibi ìwẹ̀ bàtà àti ọwọ́ sí ẹnu-ọ̀nà gbogbo ilé adìẹ. Àlejò àti òṣìṣẹ́ gbọdọ̀ wọ bàtà àti aṣọ iṣẹ́ mímọ́.',
        'Ẹyẹ igbó, eku àti ẹranko tó ń rìn kiri lè gbé Avian Influenza àti Salmonella. Pa oúnjẹ mọ́ sí ibi tí eku kò lè dé, nu oúnjẹ tó dà sílẹ̀ lẹ́sẹ̀kẹsẹ̀, kí o sì fi àwọ̀n bo ihò afẹ́fẹ́.',
        'Tí ó bá ṣeé ṣe, lo ètò fífi gbogbo adìẹ wọlé papọ̀ àti yíyọ gbogbo wọn jáde papọ̀. Lẹ́yìn náà, fọ ilé mọ́, lo oògùn ìpakúpa kòkòrò, kí o sì dúró ó kéré tán ọjọ́ 14 kí o tó mú àwọn adìẹ tuntun wọlé.',
      ],
    },
    'rabies-public-health': {
      title: 'Ìmọ̀ àti Ìdènà Rabies',
      summary: 'Bí Rabies ṣe ń tàn, àjẹsára ọdọọdún àti ohun tó yẹ kí a ṣe lẹ́yìn jíjẹ.',
      content: [
        'Rabies jẹ́ àrùn fáírọ́ọ̀sì apanirun tó ń kọlu ọpọlọ àwọn ẹranko tó ń fún ọmọ ní wàrà, títí kan ènìyàn. Ó sábà máa ń tàn nípasẹ̀ itọ́ láti inú jíjẹ, yíya awọ ara tàbí fífi ọgbẹ́ tàbí ojú kan.',
        'Fífún ajá àti ológbò ilé ní àjẹsára Rabies lọ́dọọdún ni ọ̀kan lára àwọn ọ̀nà tó dára jù láti dáàbò bo ènìyàn. Ní ọ̀pọ̀ agbègbè, òfin béèrè fún àjẹsára yìí láti dáàbò bo ìlera gbogbo ènìyàn.',
        'Bí ẹranko tí a fura sí pé ó ní Rabies bá jẹ ènìyàn tàbí ẹranko, fọ ọgbẹ́ náà pẹ̀lú ọṣẹ àti omi tó ń ṣàn fún ó kéré tán ìṣẹ́jú 15 lẹ́sẹ̀kẹsẹ̀. Èyí máa ń dín kòkòrò àrùn kù níbi ọgbẹ́.',
        'Lọ gba ìtọ́jú ìṣègùn pajawiri kí o lè bẹ̀rẹ̀ àjẹsára lẹ́yìn ìfarahàn (PEP) kí àmì àrùn tó bẹ̀rẹ̀. Tí àmì Rabies bá ti hàn, ó fẹ́rẹ̀ẹ́ máa ń pa ènìyàn. Bá dókítà ẹranko sọ̀rọ̀ kíákíá.',
      ],
    },
    'toxoplasmosis-feline-public-health': {
      title: 'Toxoplasmosis àti Ààbò Ológbò',
      summary: 'Ìtànkálẹ̀ Toxoplasma gondii, ewu oyún àti bí a ṣe lè ṣọ́ra.',
      content: [
        'Toxoplasmosis jẹ́ àkóràn tí kòkòrò Toxoplasma gondii ń fa. Ológbò ni ẹranko pàtàkì tí kòkòrò náà ti ń bímọ tí ó sì ń tú ẹyin rẹ̀ jáde nínú ìgbẹ́; ènìyàn àti ọ̀pọ̀ ẹranko mìíràn tún lè gba àkóràn náà.',
        'Ọ̀pọ̀ ológbò àti àgbàlagbà tó ní ìlera kì í ní àmì àrùn tàbí kí àmì náà dàbí ti òtútù díẹ̀. Ṣùgbọ́n ó léwu fún aboyún àti ẹni tí agbára ààbò ara rẹ̀ rẹ̀wẹ̀sì. Àkóràn tuntun nígbà oyún lè ré kọjá ibi-ọmọ.',
        'Àkóràn lè fa àbùkù ọmọ, ìṣòro ọpọlọ tàbí ojú, ìdàgbàsókè tó lọ́ra tàbí pípa oyún. Ènìyàn lè ní àkóràn láti inú àpótí ìgbẹ́ ológbò, ilẹ̀, ewébẹ̀ tí a kò fọ̀, tàbí ẹran tí a kò sè dáadáa.',
        'Kò pọndandan láti fi ológbò sílẹ̀. Jẹ́ kí ẹlòmíràn máa nu àpótí ìgbẹ́ fún aboyún; bí kò bá ṣeé ṣe, wọ ibọwọ́, kí o sì fọ ọwọ́ dáadáa. Nu àpótí náà lójoojúmọ́, nítorí ẹyin kòkòrò nílò ọjọ́ 1 sí 5 kí ó tó lè tàn.',
      ],
    },
    'anthrax-ruminant-public-health': {
      title: 'Ìkìlọ̀ Anthrax àti Ààbò Agbo',
      summary: 'Mímọ àmì Anthrax tó léwu, ikú ẹran lójijì àti ìgbésẹ̀ pajawiri.',
      content: [
        'Anthrax jẹ́ àrùn tó le tí kòkòrò Bacillus anthracis ń fa. Ó sábà kọlu màlúù, àgùntàn àti ewúrẹ́, ó sì lè pa wọ́n kíákíá. Àwọn kòkòrò rẹ̀ lè wà nínú ilẹ̀ fún ọ̀pọ̀ ọdún, ẹran sì lè gbé wọn mì nígbà ìjẹko.',
        'Ẹran lè kú lójijì láìsí àmì àìsàn tí a rí tẹ́lẹ̀. Àmì pàtàkì ni ẹ̀jẹ̀ dúdú tí kò dì láti imú, ẹnu tàbí ẹ̀yìn, àti jíjẹrà òkú ẹranko kíákíá.',
        'ÌKÌLỌ̀ ÀÀBÒ PÀTÀKÌ: Bí o bá rí ẹranko tó kú tó sì ń tú ẹ̀jẹ̀ dúdú tí kò dì jáde, MÁ ṢE ṢÍ TÀBÍ GE ÒKÚ NÁÀ. Ṣíṣí rẹ̀ lè tú kòkòrò sílẹ̀, kí wọ́n sì ba ilẹ̀ jẹ́ fún ọ̀pọ̀ ọdún.',
        'Má ṣe pa, tà tàbí jẹ ẹran tí a fura sí pé Anthrax pa; má ṣe fọwọ́ kàn án tàbí bó awọ rẹ̀. Ya agbègbè náà sọ́tọ̀, pa ènìyàn àti ajá mọ́ kúrò, kí o sì pe dókítà ẹranko àti àwọn òṣìṣẹ́ ìlera kíákíá.',
      ],
    },
  },
  ig: {
    'dog-vaccination': {
      title: 'Nduzi Ọgwụ Mgbochi Nkịta',
      summary: 'Oge ọgwụ mgbochi dị mkpa na ndị ọzọ iji chebe ahụike nkịta.',
      content: [
        'Ọgwụ mgbochi bụ otu n’ime ụzọ kacha mkpa isi chebe nkịta pụọ n’ọrịa na-efe efe ma dị ize ndụ. Ọ na-akụziri usoro nchebe ahụ ka o si chebe ahụ n’enweghị ibute ọrịa ahụ.',
        'Ọgwụ mgbochi nkịta dị mkpa na Naịjirịa na ọdịda anyanwụ Afrịka gụnyere Rabies, Canine Distemper, Parvovirus, Canine Hepatitis na Leptospirosis (DHPP/DHLPP). Rabies nwere ike ibunye mmadụ ma dị oke egwu; soro iwu mpaghara unu.',
        'A na-amalitekarị ịgba ụmụ nkịta ọgwụ mgbe ha dị izu 6 ruo 8, ma na-eme ya ọzọ kwa izu 3 ruo 4 ruo ihe dị ka izu 16. Nkịta toro eto chọrọ ọgwụ mgbakwunye kwa afọ 1 ruo 3 dịka ndụmọdụ dibịa anụmanụ na ụdị ọgwụ ahụ si dị.',
        'Ike ọgwụgwụ nta ma ọ bụ mgbu n’ebe a gbara ọgwụ ruo awa 24 ruo 48 nwere ike ime. Ọ bụrụ na ihu azaa, akpụkpọ ahụ nwee ọzịza, agbọ agbọ amalite ma ọ bụ ike ọgwụgwụ sie ike, kpọtụrụ dibịa anụmanụ ozugbo.',
      ],
    },
    'cat-vaccination': {
      title: 'Nduzi Ọgwụ Mgbochi Nwamba',
      summary: 'Ọgwụ mgbochi dị mkpa megide Panleukopenia, Calicivirus na Rabies maka nwamba.',
      content: [
        'Ọgwụ mgbochi na-echebe nwamba pụọ n’ọrịa nje na-efe efe. Ọbụna nwamba na-anọ naanị n’ụlọ chọrọ ọgwụ mgbochi, n’ihi na nje nwere ike isi n’ikuku, akpụkpọ ụkwụ ma ọ bụ uwe bata.',
        'Ọgwụ mgbochi bụ isi na-echebe nwamba pụọ na Feline Panleukopenia, Feline Viral Rhinotracheitis (FVR), Feline Calicivirus (FCV) na Rabies. Panleukopenia nwere ike ibute akpịrị ịkpọ nkụ siri ike na ọnwụ ụmụ nwamba.',
        'A na-amalite ọgwụ ụmụ nwamba mgbe ha dị izu 6 ruo 8, ma na-eme ya ọzọ kwa izu 3 ruo 4 ruo izu 16. A na-enye ọgwụ mgbakwunye mgbe otu afọ gachara, ma emesịa dịka ndụmọdụ dibịa anụmanụ si dị.',
        'Dee ọgwụ mgbochi niile e nyere nwamba, karịsịa tupu ịkpọga ya ebe a na-elekọta anụmanụ. Dibịa anụmanụ ga-ahọrọ usoro dabara n’ebe ọ bi na ihe ize ndụ ọrịa.',
      ],
    },
    'poultry-vaccination': {
      title: 'Usoro Ọgwụ Mgbochi Ọkụkọ',
      summary: 'Chebe ìgwè ọkụkọ pụọ na Newcastle, Gumboro na Fowl Pox.',
      content: [
        'Ọgwụ mgbochi bụ ntọala maka ịzụ ọkụkọ nke ọma. Ọrịa na-efe ngwa ngwa nwere ike gbasaa n’ìgwè ọkụkọ n’ime awa ole na ole, kpatara ọnwụ na nnukwu mfu ego.',
        'Ọgwụ ndị dị mkpa gụnyere Newcastle (ND), Gumboro (IBD), Fowl Pox, Marek na Infectious Bronchitis. Newcastle nwere ike igbu ihe fọrọ nke nta ka ọ bụrụ ọkụkọ niile a na-enyeghị ọgwụ mgbochi.',
        'Oge ọgwụ dabere n’afọ ọkụkọ: a na-enye ọgwụ Marek n’ụbọchị ọ pụtara n’akpa àkwá, Gumboro na-abụkarị n’ime mmiri n’izu 1 na 3, a na-amalite Newcastle n’ụbọchị 7 ma na-emegharị ya. Debe ọgwụ n’oyi kwesịrị ekwesị.',
        'Usoro ọgwụ dị iche dịka ụdị ọkụkọ na mpaghara si dị. Kpọtụrụ dibịa anụmanụ tupu ịhọrọ usoro. Jikọta ọgwụ mgbochi na ịdị ọcha ụlọ ọkụkọ, nri dị ọcha na usoro mgbochi ọrịa.',
      ],
    },
    'clean-water-nutrition': {
      title: 'Mmiri Dị Ọcha na Ahụike Anụmanụ',
      summary: 'Ihe mere mmiri dị ọcha ji dị mkpa nye anụ ụlọ na anụ ugbo.',
      content: [
        'Mmiri dị ezigbo mkpa nye anụ ụlọ na anụ ugbo. Ịtụfu naanị 10% mmiri dị n’ahụ nwere ike imebi akụkụ ahụ, kpatara ọrịa ọkụ ma ọ bụ ọnwụ. Mmiri na-enyere mgbari nri na ịhazi okpomọkụ ahụ.',
        'Nye ha mmiri ọhụrụ na-adịghị emerụ emerụ. Mmiri kwụ otu ebe, nke jupụtara na algae ma ọ bụ kemịkal nwere ike ibu E. coli, Salmonella na nje ndị ọzọ. Mmiri rụrụ arụ na-emebi etu ọkụkọ na ezi si eji nri ma kpatara ọrịa afọ.',
        'Na-asa efere mmiri ma ọ bụ ihe a na-aṅụ mmiri na ya kwa ụbọchị. N’ebe ọkụ dị, debe mmiri n’ebe ndo ka anụmanụ ṅụọ nke ọma ma ghara ịrịa ọrịa okpomọkụ.',
        'Gbaa mbọ hụ na anụmanụ na-enweta mmiri mgbe niile. Ọ bụrụ na ha aṅụ mmiri gabiga ókè ma ọ bụ jụ ịṅụ ya, kpọtụrụ dibịa anụmanụ; ọ nwere ike ịbụ ihe ịrịba ama ọrịa akụrụ, ọrịa shuga ma ọ bụ ọrịa ọzọ.',
      ],
    },
    'ruminant-health-deworming': {
      title: 'Ahụike Anụmanụ Na-ata Ahịhịa na Iwepụ Ikpuru',
      summary: 'Ụzọ iwepụ ikpuru na igbochi nje n’ime ehi, ewu na atụrụ.',
      content: [
        'Ikpuru dị n’ime na nje ndị ọzọ bụ nnukwu ihe ize ndụ nye ehi, ewu na atụrụ n’ọdịda anyanwụ Afrịka. Ha nwere ike ibute anaemia, ịda arọ, ibelata mmiri ara na ọnwụ, karịchaa ụmụ anụmanụ.',
        'Hazie ọgwụgwọ ikpuru n’oge dị mkpa n’afọ, karịchaa na mmalite na ngwụcha oge mmiri ozuzo. Iji ọgwụ ugboro ugboro n’enweghị mkpa nwere ike ime ka ọgwụ ghara ịrụ ọrụ; dibịa anụmanụ nwere ike nyere aka họrọ oge kwesịrị ekwesị.',
        'Gbanwee ebe anụmanụ na-ata ahịhịa ka ahịhịa zuru ike ma mebie okirikiri ndụ ikpuru. Ekwela ka ha rie ahịhịa mmiri n’isi ụtụtụ, n’ihi na ikpuru nwere ike ịrapara na ya.',
        'Jiri ọgwụ igbu akọrọ nke dibịa anụmanụ kwadoro. Soro oge nchere tupu eri anụ ma ọ bụ ṅụọ mmiri ara mgbe e nyechara ọgwụ.',
      ],
    },
    'pet-nutrition-feeding': {
      title: 'Nri Anụ Ụlọ Dị Mma ma Dị Nchekwa',
      summary: 'Ntuziaka nri kwesịrị ekwesị na nri ụlọ na-egbu nkịta na nwamba.',
      content: [
        'Nri zuru oke dabara n’ụdị anụmanụ na-enyere aka ịnọgide na-enwe ahụike. Nkịta chọrọ protein, abụba dị mma, carbohydrate, vitamin na mineral; nwamba chọrọ protein karịa na taurine.',
        'Yabasị, galik na leek nwere ike imebi mkpụrụ ndụ ọbara uhie ma kpatara anaemia. Chocolate, kọfị na ihe nwere caffeine nwere ike ịkpata obi ịkụ aka n’ụzọ na-adịghị mma ma ọ bụ ọdịdọ.',
        'Mkpụrụ vaịn na mịrị vaịn nwere ike imebi akụrụ; ọkpụkpụ anụ esi nri nwere ike ịgbaji ma merụọ eriri afọ; xylitol dị n’ụfọdụ ihe ụtọ nwere ike iwetu shuga n’ọbara ma mebie imeju. Enyela anụmanụ ihe ndị a.',
        'Na-enye nri n’oge a kara aka kama ịhapụ ya n’ihu anụmanụ mgbe niile ka ha ghara ibu oke ibu. Ọ bụrụ na ị na-agbanwe nri, gwakọta nke ọhụrụ nke nta nke nta n’ime ụbọchị 7 ruo 10.',
      ],
    },
    'canine-emergency-first-aid': {
      title: 'Enyemaka Mbụ maka Nkịta N’oge Mberede',
      summary: 'Mata ihe ịrịba ama dị ize ndụ ma nyere anụmanụ aka tupu i ruo n’ụlọ ọgwụ.',
      content: [
        'Ịmata ihe mberede ahụike na inye enyemaka mbụ nwere ike ịzọpụta anụ ụlọ. Ihe mberede gụnyere mmerụ ahụ siri ike, enyo nsị, ọrịa okpomọkụ, afọ ịza aza na Parvovirus.',
        'Ọ bụrụ na nkịta nwere ọrịa okpomọkụ—iku ume ngwa ngwa, chịngọm uhie gbara ọchịchịrị, asụ ma ọ bụ daa—bugara ya n’ebe ndo ma ọ bụ ebe ikuku oyi dị. Tinye mmiri jụrụ oyi, ọ bụghị mmiri akpụrụ akpụ, n’afọ, ụkwụ na olu ya mgbe ị na-ebuga ya n’ụlọ ọgwụ anụmanụ.',
        'Ọ bụrụ na ọ na-agba ọbara, jiri ákwà dị ọcha ma ọ bụ gauze pịa ebe ahụ. Ekechila eriri siri ike n’ahụ ya ma e wezụga ma ọkachamara gwara gị. Mee ka anụmanụ dị jụụ ma gbochie ya imegharị nke ukwuu.',
        'Ọ bụrụ na ị chere na o loro nsị, amanyela ya ịgbọ agbọ ma e wezụga ma dibịa anụmanụ gwara gị. Ụfọdụ kemịkal nwere ike imebi akpịrị karịa mgbe ọ na-agbọ agbọ. Were akpa ma ọ bụ karama nsị ahụ gaa n’ụlọ ọgwụ.',
      ],
    },
    'poultry-biosecurity': {
      title: 'Usoro Mgbochi Ọrịa Ọkụkọ',
      summary: 'Ịdị ọcha n’ugbo, ihicha na ikewapụ iji kwụsị mgbasa ọrịa.',
      content: [
        'Mgbochi ọrịa gụnyere usoro niile a na-eme iji gbochie nje ịbanye ma gbasaa n’ìgwè ọkụkọ. Usoro mgbochi siri ike na-adị ọnụ ala karịa ịnwa ịgwọ ọrịa gbasasịrị.',
        'Mee ngere gburugburu ugbo, chịkwaa njem ndị mmadụ, tinyekwa ebe a na-asacha akpụkpọ ụkwụ na aka n’ọnụ ụzọ ụlọ ọkụkọ ọ bụla. Ndị ọbịa na ndị ọrụ kwesịrị iyi akpụkpọ ụkwụ na uwe ọrụ dị ọcha.',
        'Nnụnụ ọhịa, oke na anụmanụ kpafuru akpafu nwere ike ibute Avian Influenza na Salmonella. Debe nri n’ebe oke na-apụghị iru, hichaa nri wụsara ozugbo, tinyekwa ụgbụ n’oghere ikuku.',
        'Ọ bụrụ na o kwe omume, tinye ìgwè ọkụkọ niile n’otu oge ma wepụ ha niile n’otu oge. Hichaa ụlọ ahụ ma jiri ọgwụ gbuo nje, chere ma ọ dịkarịa ala ụbọchị 14 tupu i webata ọkụkọ ọhụrụ.',
      ],
    },
    'rabies-public-health': {
      title: 'Ịmata na Igbochi Rabies',
      summary: 'Ka Rabies si agbasa, ọgwụ mgbochi kwa afọ na ihe a ga-eme mgbe anụmanụ tara mmadụ.',
      content: [
        'Rabies bụ ọrịa nje na-egbu egbu nke na-awakpo ụbụrụ anụmanụ na-enye ụmụ ha mmiri ara, gụnyere mmadụ. Ọ na-agbasakarị site n’asụ mgbe anụmanụ tara ma ọ bụ kpụchaa mmadụ, ma ọ bụ mgbe asụ metụrụ ọnya mepere emepe, anya ma ọ bụ ọnụ.',
        'Ịgba nkịta na nwamba ụlọ ọgwụ Rabies kwa afọ bụ otu n’ime ụzọ kacha dị irè isi chebe mmadụ. N’ọtụtụ ebe, iwu chọrọ ka e nye anụ ụlọ ọgwụ a iji chebe ahụike ọha.',
        'Ọ bụrụ na anụmanụ a na-enyo enyo na ọ nwere Rabies tara mmadụ ma ọ bụ anụmanụ, were ncha na mmiri na-asọ asọ saa ọnya ahụ ozugbo ma ọ dịkarịa ala nkeji 15. Nke a na-enyere aka ibelata nje dị n’ọnya ahụ.',
        'Chọọ enyemaka ahụike mberede ozugbo ka ịmalite ọgwụ mgbochi mgbe e metụrụ gị (PEP) tupu ihe ịrịba ama amalite. Mgbe ihe ịrịba ama Rabies pụtara, ọrịa ahụ na-egbu ihe fọrọ nke nta ka ọ bụrụ mgbe niile. Kpọtụrụ dibịa anụmanụ ngwa ngwa.',
      ],
    },
    'toxoplasmosis-feline-public-health': {
      title: 'Toxoplasmosis na Nchekwa Nwamba',
      summary: 'Mgbasa Toxoplasma gondii, ihe ize ndụ nye ime na ụzọ nchebe.',
      content: [
        'Toxoplasmosis bụ ọrịa nje Toxoplasma gondii na-akpata. Nwamba bụ anụmanụ bụ isi ebe nje ahụ na-amụba ma na-ewepụta àkwá ya n’ime nsị; mmadụ na ọtụtụ anụmanụ ndị ọzọ nwekwara ike ibute ọrịa ahụ.',
        'Ọtụtụ nwamba na ndị okenye nwere ahụike anaghị enwe ihe ịrịba ama ma ọ bụ na-enwe nke yiri oyi nta. Ma ọrịa ahụ dị ize ndụ nye ndị dị ime na ndị usoro nchebe ahụ ha adịghị ike. Ọrịa ọhụrụ mgbe ime dị nwere ike gafere nwatakịrị site n’akpa nwa.',
        'Ọrịa ahụ nwere ike kpatara nkwarụ nwa, nsogbu ụbụrụ ma ọ bụ anya, ito eto nwayọ ma ọ bụ ime ọpụpụ. Mmadụ nwere ike ibute ya site n’akpa nsị nwamba, ala, akwụkwọ nri a na-asaghị ma ọ bụ anụ esighị nke ọma.',
        'Ọ dịghị mkpa ịhapụ nwamba ụlọ. Ka onye ọzọ na-ehicha akpa nsị nwamba kwa ụbọchị maka onye dị ime; ma ọ bụrụ na ọ gaghị ekwe omume, yiri uwe aka ma saa aka nke ọma. Na-ehicha akpa ahụ kwa ụbọchị n’ihi na àkwá nje na-ewe ụbọchị 1 ruo 5 tupu ha nwee ike ibute ọrịa.',
      ],
    },
    'anthrax-ruminant-public-health': {
      title: 'Ịdọ Aka ná Ntị Anthrax na Nchekwa Ìgwè',
      summary: 'Ịmata Anthrax na-egbu egbu, ọnwụ anụmanụ mberede na usoro mberede.',
      content: [
        'Anthrax bụ ọrịa siri ike nke nje Bacillus anthracis na-akpata. Ọ na-awakpo ehi, atụrụ na ewu, ma nwee ike igbu ha ngwa ngwa. Nje ya nwere ike ịdị ndụ n’ala ruo ọtụtụ afọ, anụmanụ nwekwara ike ilo ya mgbe ha na-ata ahịhịa.',
        'Anụmanụ nwere ike ịnwụ na mberede n’enweghị ihe ịrịba ama a hụrụ tupu mgbe ahụ. Ihe ịrịba ama dị mkpa bụ ọbara gbara ọchịchịrị nke na-adịghị akpụkọ ma na-esi n’imị imi, ọnụ ma ọ bụ ike pụta, nakwa ire ere ngwa ngwa nke ozu.',
        'ỊDỌ AKA NÁ NTỊ NKE DỊ OKÉ MKPA: Ọ bụrụ na ị hụ anụmanụ nwụrụ anwụ na-awụpụ ọbara gbara ọchịchịrị nke na-adịghị akpụkọ, EMEPELA MA Ọ BỤ EGBUGHỊ OZU YA. Imeghe ozu nwere ike ịhapụ nje ndị ga-emerụ ala ruo ọtụtụ afọ.',
        'Egbula, erekwala, emetụla, akpụpụla akpụkpọ ma ọ bụ rie anụ a na-enyo enyo na Anthrax gburu. Kewapụ ebe ahụ, mee ka mmadụ na nkịta pụọ, kpọtụrụ dibịa anụmanụ na ndị ọrụ ahụike ọha ozugbo maka iwepụ ozu ahụ n’ụzọ dị nchebe.',
      ],
    },
  },
};

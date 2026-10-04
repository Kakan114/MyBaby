export const sv = {
  navigation: {
    today: 'Idag',
    log: 'Logga',
    learn: 'Lär',
    assistant: 'Assistent',
    family: 'Familj',
  },
  bootstrap: {
    checking: 'Förbereder MyBaby…',
    retry: 'Försök igen',
    localDataError: {
      title: 'Det gick inte att öppna dina lokala data',
      description: 'MyBaby kunde inte läsa dina sparade uppgifter. Försök igen.',
    },
    activeSelectionRequired: {
      title: 'Ett barn behöver väljas',
      description:
        'Barnuppgifter finns sparade, men inget aktivt barn är valt. Försök igen.',
    },
  },
  onboarding: {
    placeholder: {
      title: 'Skapa barnprofil',
      description: 'I nästa steg lägger vi till formuläret för barnets profil.',
    },
  },
  screens: {
    today: {
      title: 'Idag',
      description: 'Din översikt kommer att visas här.',
    },
    log: {
      title: 'Logga',
      description: 'Här kommer du att kunna registrera barnets vardag.',
    },
    learn: {
      title: 'Lär',
      description: 'Åldersanpassad kunskap kommer att finnas här.',
    },
    assistant: {
      title: 'Assistent',
      description: 'Din personliga assistent kommer att finnas här.',
    },
    family: {
      title: 'Familj',
      description: 'Familj och inställningar kommer att finnas här.',
    },
  },
} as const;

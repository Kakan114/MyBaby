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
    firstChild: {
      title: 'Skapa barnprofil',
      description:
        'Lägg till barnets namn och födelsedatum för att komma igång.',
      displayName: {
        label: 'Barnets namn eller smeknamn',
        placeholder: 'Till exempel Mio',
      },
      dateOfBirth: {
        label: 'Födelsedatum',
        select: 'Välj födelsedatum',
        change: 'Ändra',
        confirm: 'Klar',
        cancel: 'Avbryt',
      },
      submit: 'Skapa barnprofil',
      submitting: 'Skapar barnprofil…',
      errors: {
        invalidDisplayName: 'Ange barnets namn eller smeknamn.',
        invalidCalendarDate: 'Välj ett giltigt födelsedatum.',
        futureDateOfBirth: 'Födelsedatumet kan inte ligga i framtiden.',
        creationFailed: 'Det gick inte att slutföra barnprofilen',
      },
      recovery: {
        description:
          'MyBaby behöver kontrollera dina lokala uppgifter innan du försöker igen.',
        action: 'Kontrollera igen',
      },
    },
  },
  children: {
    age: {
      daysOld_one: '{{count}} dag gammal',
      daysOld_other: '{{count}} dagar gammal',
      days_one: '{{count}} dag',
      days_other: '{{count}} dagar',
      weeks_one: '{{count}} vecka',
      weeks_other: '{{count}} veckor',
      weeksAndDays: '{{weeks}} och {{days}}',
      monthsAndDays: '{{months}} och {{days}}',
      months_one: '{{count}} månad',
      months_other: '{{count}} månader',
      years_one: '{{count}} år',
      years_other: '{{count}} år',
      yearsAndMonths: '{{years}} och {{months}}',
    },
  },
  screens: {
    today: {
      title: 'Idag',
      loading: 'Läser barnets uppgifter…',
      missing: {
        title: 'Inget aktivt barn kunde hittas',
        description: 'MyBaby behöver kontrollera dina sparade barnuppgifter. Försök igen.',
      },
      error: {
        title: 'Det gick inte att läsa barnets uppgifter',
        description: 'MyBaby kunde inte visa barnets namn och ålder. Försök igen.',
      },
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

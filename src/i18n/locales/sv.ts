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
    activeSelection: {
      title: 'Välj barnprofil',
      description: 'Välj den barnprofil du vill fortsätta med.',
      loading: 'Läser sparade barnprofiler…',
      select: 'Välj',
      selecting: 'Väljer…',
      selectAccessibility: 'Välj {{name}}',
      recheck: 'Kontrollera igen',
      empty: {
        title: 'Inga barnprofiler kunde hittas',
        description:
          'MyBaby behöver kontrollera dina sparade uppgifter innan du fortsätter.',
      },
      error: {
        title: 'Barnprofilerna kunde inte läsas',
        description: 'Försök läsa dina sparade barnprofiler igen.',
      },
      uncertain: {
        title: 'Valet behöver kontrolleras',
        description:
          'MyBaby behöver kontrollera om barnprofilen valdes innan du försöker igen.',
      },
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
  logging: {
    title: 'Logga',
    description: 'Vad vill du registrera?',
    feeding: {
      title: 'Matning',
      description: 'Registrera amning eller flaskmatning.',
      open: 'Logga matning',
    },
    sleep: {
      title: 'Sömn',
      description: 'Starta eller avsluta barnets sömn.',
      open: 'Logga sömn',
      loading: 'Kontrollerar pågående sömn…',
      unavailable: 'Sömnstatus kunde inte läsas. Öppna Sömn för att försöka igen.',
      ongoing: 'Sover · {{elapsed}}',
      startedAt: 'Startade {{time}}',
      openOngoing: 'Visa pågående sömn',
    },
  },
  sleep: {
    title: 'Sömn',
    description: 'Följ pågående sömn och se de 20 senaste avslutade sovstunderna.',
    loading: 'Läser sparad sömn…',
    idle: 'Ingen sömn pågår',
    start: 'Somnade nu',
    active: 'Sover',
    startedAt: 'Startade {{time}}',
    complete: 'Vaknade nu',
    error: {
      title: 'Sömnen kunde inte läsas',
      description: 'MyBaby kunde inte läsa den sparade sömnen. Försök igen.',
    },
    clock: {
      title: 'Enhetens tid har ändrats',
      description: 'Sömnen kan inte avslutas förrän enhetens tid är senare än starttiden.',
    },
    uncertain: {
      title: 'Resultatet har kontrollerats',
      description: 'MyBaby har läst den sparade sömnen igen. Kontrollera läget innan du fortsätter.',
    },
    discard: {
      action: 'Avbryt sömn',
      title: 'Avbryt sömnen?',
      message: 'Den registrerade sömntiden tas bort och sparas inte.',
      cancel: 'Fortsätt',
      confirm: 'Avbryt och radera',
    },
    history: {
      title: 'Senaste sömnen',
      empty: 'Ingen avslutad sömn har registrerats ännu.',
      today: 'Idag',
      yesterday: 'Igår',
    },
  },
  feeding: {
    title: 'Logga matning',
    description: 'Registrera en avslutad matning för det aktiva barnet.',
    kind: {
      label: 'Typ av matning',
      breast: 'Amning',
      bottle: 'Flaska',
    },
    breast: {
      left: 'Vänster (minuter)',
      right: 'Höger (minuter)',
    },
    bottle: {
      amount: 'Mängd (ml)',
      amountPlaceholder: 'Till exempel 72,5',
      contents: {
        label: 'Innehåll',
        'expressed-breast-milk': 'Bröstmjölk',
        formula: 'Ersättning',
        mixed: 'Bröstmjölk + ersättning',
      },
      mixedHint: 'Blandat betyder att samma flaska innehåller både bröstmjölk och ersättning.',
    },
    save: 'Spara matning',
    saving: 'Sparar…',
    errors: {
      duration: 'Ange en giltig tid över noll för minst en sida.',
      amount: 'Ange en mängd över noll, med högst en decimal.',
    },
    success: {
      title: 'Matningen är sparad',
      description: 'Matningen har sparats lokalt för det aktiva barnet.',
      another: 'Logga en till',
    },
    uncertain: {
      title: 'Matningen kunde inte bekräftas',
      description: 'MyBaby kan inte säkert avgöra om matningen sparades. Försök inte spara samma matning igen just nu.',
    },
    history: {
      title: 'Matningshistorik',
      description: 'De 20 senaste avslutade matningarna för det aktiva barnet.',
      open: 'Visa matningshistorik',
      loading: 'Läser matningshistorik…',
      empty: 'Inga matningar registrerade ännu.',
      error: {
        title: 'Matningshistoriken kunde inte läsas',
        description: 'MyBaby kunde inte läsa de sparade matningarna. Försök igen.',
      },
      date: {
        today: 'Idag',
        yesterday: 'Igår',
      },
      duration: {
        minute: 'min',
        second: 'sek',
      },
    },
    timer: {
      title: 'Amningstimer',
      loading: 'Läser pågående amning…',
      startLeft: 'Starta vänster',
      startRight: 'Starta höger',
      manual: 'Ange tid manuellt',
      backToTimer: 'Tillbaka till timern',
      running: '{{side}} pågår',
      paused: 'Amningen är pausad',
      finished: 'Sammanfattning',
      pause: 'Pausa',
      resume: 'Fortsätt',
      resumeSide: 'Fortsätter på {{side}}',
      switchSide: 'Byt sida',
      changeResumeSide: 'Byt sida för fortsättning',
      finish: 'Avsluta',
      save: 'Spara matning',
      discard: {
        active: 'Avbryt matning',
        finished: 'Radera utan att spara',
        confirmation: {
          active: {
            title: 'Avbryt matningen?',
            message: 'Den registrerade tiden tas bort och matningen sparas inte.',
            cancel: 'Fortsätt matning',
            confirm: 'Avbryt och radera',
          },
          finished: {
            title: 'Radera matningen?',
            message: 'Den avslutade matningen tas bort och kommer inte att sparas.',
            cancel: 'Behåll',
            confirm: 'Radera utan att spara',
          },
        },
      },
      side: {
        left: 'Vänster',
        right: 'Höger',
      },
      error: {
        title: 'Timern kunde inte läsas',
        description: 'Kontrollera den sparade timern igen eller ange tiden manuellt.',
      },
      issue: {
        clock: {
          title: 'Enhetens tid har ändrats',
          description: 'Timern räknar inte osäker tid. Kontrollera läget eller ange tiden manuellt.',
        },
        ownership: {
          title: 'Timern tillhör ett annat barn',
          description: 'Välj rätt barnprofil innan du fortsätter eller sparar timern.',
        },
        'duration-too-short': {
          title: 'Amningen är för kort för att sparas',
          description: 'Fortsätt timern eller ange tiden manuellt.',
        },
        uncertain: {
          title: 'Resultatet behöver kontrolleras',
          description: 'MyBaby har läst den sparade timern igen. Kontrollera läget innan du fortsätter.',
        },
      },
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

// Contenido de los datos de prueba: creadores, 10 quizzes públicos variados y un borrador.

export type SeedOpt = { text: string; correct?: boolean };
export type SeedQ =
  | {
      type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'POLL';
      prompt: string;
      options: SeedOpt[];
      time?: number;
      explanation?: string;
      hint?: string;
      multi?: boolean;
      points?: 'NORMAL' | 'DOUBLE';
    }
  | {
      type: 'TYPE_ANSWER';
      prompt: string;
      accepted: string[];
      time?: number;
      explanation?: string;
      hint?: string;
    }
  | {
      /** Tipos de la Fase 4: configuración tal cual la guarda el editor */
      type:
        | 'ORDER'
        | 'MATCH'
        | 'SLIDER'
        | 'PIN'
        | 'FILL_BLANK'
        | 'AUDIO'
        | 'REVEAL_IMAGE'
        | 'WORD_CLOUD'
        | 'OPEN_VOTE'
        | 'DRAW';
      prompt: string;
      /** ORDER: en el orden correcto */
      options?: SeedOpt[];
      config?: Record<string, unknown>;
      media?: { kind: 'image' | 'audio'; url: string };
      time?: number;
      explanation?: string;
      hint?: string;
      points?: 'NORMAL' | 'DOUBLE';
    };

export interface SeedQuiz {
  author: string;
  title: string;
  description: string;
  category: string;
  language: 'es' | 'en';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  theme: string;
  tags: string[];
  /** Días desde la publicación (para "Nuevos esta semana" y la tendencia) */
  daysAgo: number;
  plays: number;
  draft?: boolean;
  questions: SeedQ[];
}

export interface SeedUser {
  username: string;
  name: string;
  email: string;
  bio?: string;
  country?: string;
  xp?: number;
}

export const PASSWORD = 'QuizRush123!';

/** Cuenta con rol de administración (panel /admin). Solo para desarrollo. */
export const ADMIN_USER: SeedUser = {
  username: 'admin_rush',
  name: 'Admin Rush',
  email: 'admin@quizrush.dev',
  bio: 'Moderación de Quiz_Rush 🛠️',
};

export const CREATORS: SeedUser[] = [
  {
    username: 'demo',
    name: 'Rusher Demo',
    email: 'demo@quizrush.dev',
    bio: 'Cuenta de demostración de Quiz_Rush ⚡',
    country: 'CO',
    xp: 1250,
  },
  {
    username: 'profe_luna',
    name: 'Profe Luna',
    email: 'luna@quizrush.dev',
    bio: 'Profesora de historia y matemáticas. Aprender jugando 📚',
    country: 'MX',
    xp: 8400,
  },
  {
    username: 'cine_maniaco',
    name: 'Cine Maníaco',
    email: 'cine@quizrush.dev',
    bio: 'Palomitas, fútbol y trivia 🍿⚽',
    country: 'AR',
    xp: 5200,
  },
  {
    username: 'trivia_queen',
    name: 'Trivia Queen',
    email: 'queen@quizrush.dev',
    bio: 'Pop culture & tech trivia in English 👑',
    country: 'US',
    xp: 9900,
  },
  {
    username: 'explora_mundo',
    name: 'Explora Mundo',
    email: 'explora@quizrush.dev',
    bio: 'Naturaleza, viajes y dinámicas para equipos 🌍',
    country: 'ES',
    xp: 3100,
  },
];

/** Jugadores que califican, comentan y siguen (comunidad simulada). */
export const FANS: SeedUser[] = [
  'sofi',
  'leo_gamer',
  'maxpower',
  'juli_rush',
  'tono_quiz',
  'ana_bolt',
].map((u, i) => ({
  username: u,
  name: ['Sofi', 'Leo', 'MaxPower', 'Juli', 'Toño', 'Ana Bolt'][i]!,
  email: `${u.replace('_', '')}@quizrush.dev`,
  xp: 300 + i * 450,
  level: 2 + i,
}));

export const COMMENTS = [
  '¡Me encantó! Lo usé con mi clase y fue un éxito total 🔥',
  'La pregunta 3 me hizo dudar muchísimo 😅',
  'Excelente para repasar antes del examen.',
  '¿Habrá segunda parte? ¡Quiero más!',
  'Mis amigos y yo lo jugamos en la noche de trivia, 10/10.',
  'Muy bien explicado cada respuesta 👏',
];
export const REPLIES = [
  '¡Gracias por jugar! 😊',
  'Totalmente de acuerdo',
  'Jajaja a mí también me pasó',
];

export const QUIZZES: SeedQuiz[] = [
  {
    author: 'demo',
    title: 'Viaje por el Sistema Solar',
    description:
      'Planetas, lunas y curiosidades del vecindario cósmico. ¿Cuánto sabes del espacio?',
    category: 'science',
    language: 'es',
    difficulty: 'EASY',
    theme: 'space',
    tags: ['astronomía', 'planetas', 'espacio'],
    daysAgo: 20,
    plays: 1840,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál es el planeta más grande del Sistema Solar?',
        options: [
          { text: 'Júpiter', correct: true },
          { text: 'Saturno' },
          { text: 'Neptuno' },
          { text: 'Tierra' },
        ],
        explanation: 'En Júpiter cabrían unas 1.300 Tierras.',
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'Venus es el planeta más caliente, aunque Mercurio está más cerca del Sol.',
        options: [{ text: 'Verdadero', correct: true }, { text: 'Falso' }],
        explanation: 'Su atmósfera de CO₂ provoca un efecto invernadero extremo (~465 °C).',
      },
      {
        type: 'TYPE_ANSWER',
        prompt: '¿Cómo se llama el satélite natural de la Tierra?',
        accepted: ['Luna', 'La Luna'],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Qué planetas tienen anillos?',
        multi: true,
        options: [
          { text: 'Saturno', correct: true },
          { text: 'Júpiter', correct: true },
          { text: 'Marte' },
          { text: 'Urano', correct: true },
        ],
        time: 30,
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuánto tarda la luz del Sol en llegar a la Tierra?',
        options: [
          { text: '8 segundos' },
          { text: 'Unos 8 minutos', correct: true },
          { text: '8 horas' },
          { text: '1 día' },
        ],
        points: 'DOUBLE',
      },
      {
        type: 'POLL',
        prompt: '¿A qué planeta te gustaría viajar?',
        options: [
          { text: 'Marte' },
          { text: 'Saturno' },
          { text: 'Venus' },
          { text: 'Me quedo en la Tierra' },
        ],
      },
    ],
  },
  {
    author: 'demo',
    title: 'Capitales del mundo exprés',
    description: 'Diez segundos por pregunta. ¡Demuestra que eres un geógrafo veloz!',
    category: 'geography',
    language: 'es',
    difficulty: 'MEDIUM',
    theme: 'ocean',
    tags: ['capitales', 'países', 'geografía'],
    daysAgo: 12,
    plays: 960,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál es la capital de Australia?',
        options: [
          { text: 'Sídney' },
          { text: 'Canberra', correct: true },
          { text: 'Melbourne' },
          { text: 'Perth' },
        ],
        time: 10,
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál es la capital de Canadá?',
        options: [
          { text: 'Toronto' },
          { text: 'Vancouver' },
          { text: 'Ottawa', correct: true },
          { text: 'Montreal' },
        ],
        time: 10,
      },
      {
        type: 'TYPE_ANSWER',
        prompt: '¿Capital de Colombia?',
        accepted: ['Bogotá', 'Santa Fe de Bogotá'],
        time: 15,
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'La capital de Brasil es Río de Janeiro.',
        options: [{ text: 'Verdadero' }, { text: 'Falso', correct: true }],
        explanation: 'Es Brasilia desde 1960.',
        time: 10,
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál es la capital de Japón?',
        options: [
          { text: 'Kioto' },
          { text: 'Osaka' },
          { text: 'Tokio', correct: true },
          { text: 'Hiroshima' },
        ],
        time: 10,
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál es la capital de Marruecos?',
        options: [
          { text: 'Casablanca' },
          { text: 'Rabat', correct: true },
          { text: 'Marrakech' },
          { text: 'Fez' },
        ],
        time: 10,
      },
    ],
  },
  {
    author: 'explora_mundo',
    title: 'Animales asombrosos',
    description: 'Récords, superpoderes y rarezas del reino animal. Ideal para toda la familia.',
    category: 'nature',
    language: 'es',
    difficulty: 'EASY',
    theme: 'jungle',
    tags: ['animales', 'naturaleza', 'récords'],
    daysAgo: 3,
    plays: 420,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál es el animal terrestre más rápido?',
        options: [
          { text: 'Guepardo', correct: true },
          { text: 'León' },
          { text: 'Caballo' },
          { text: 'Avestruz' },
        ],
        explanation: 'El guepardo alcanza ~110 km/h en carreras cortas.',
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'Los pulpos tienen tres corazones.',
        options: [{ text: 'Verdadero', correct: true }, { text: 'Falso' }],
      },
      {
        type: 'TYPE_ANSWER',
        prompt: '¿Cómo se llama la cría del caballo?',
        accepted: ['Potro', 'Potrillo'],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Qué animal duerme más horas al día?',
        options: [
          { text: 'Perezoso' },
          { text: 'Koala', correct: true },
          { text: 'Gato' },
          { text: 'Murciélago' },
        ],
        hint: 'Vive en Australia y come eucalipto.',
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál de estos es un mamífero?',
        options: [
          { text: 'Tiburón' },
          { text: 'Delfín', correct: true },
          { text: 'Pingüino' },
          { text: 'Cocodrilo' },
        ],
      },
    ],
  },
  {
    author: 'profe_luna',
    title: 'Historia de Latinoamérica',
    description:
      'Independencias, civilizaciones y personajes clave. Perfecto para repasar antes del examen.',
    category: 'history',
    language: 'es',
    difficulty: 'MEDIUM',
    theme: 'volcano',
    tags: ['historia', 'latinoamérica', 'repaso'],
    daysAgo: 25,
    plays: 2310,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Qué civilización construyó Machu Picchu?',
        options: [
          { text: 'Maya' },
          { text: 'Azteca' },
          { text: 'Inca', correct: true },
          { text: 'Olmeca' },
        ],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿En qué año se declaró la independencia de México?',
        options: [
          { text: '1810', correct: true },
          { text: '1821' },
          { text: '1776' },
          { text: '1910' },
        ],
        explanation:
          'El Grito de Dolores fue el 16 de septiembre de 1810; la independencia se consumó en 1821.',
      },
      {
        type: 'TYPE_ANSWER',
        prompt: '¿Qué libertador es conocido como "El Libertador" de cinco naciones sudamericanas?',
        accepted: ['Simón Bolívar', 'Bolívar'],
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'Tenochtitlan fue la capital del imperio azteca.',
        options: [{ text: 'Verdadero', correct: true }, { text: 'Falso' }],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Qué país fue el primero en independizarse en América Latina?',
        options: [
          { text: 'Haití', correct: true },
          { text: 'Argentina' },
          { text: 'Colombia' },
          { text: 'Chile' },
        ],
        points: 'DOUBLE',
        explanation: 'Haití se independizó de Francia en 1804.',
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Quién lideró la independencia de Argentina, Chile y Perú?',
        options: [
          { text: 'José de San Martín', correct: true },
          { text: 'Miguel Hidalgo' },
          { text: 'Antonio Nariño' },
          { text: 'José Martí' },
        ],
      },
    ],
  },
  {
    author: 'profe_luna',
    title: 'Matemáticas mentales',
    description:
      'Cálculo rápido sin calculadora. ¿Puedes con todas antes de que se acabe el tiempo?',
    category: 'math',
    language: 'es',
    difficulty: 'MEDIUM',
    theme: 'neon',
    tags: ['cálculo', 'mental', 'números'],
    daysAgo: 6,
    plays: 780,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuánto es 12 × 12?',
        options: [
          { text: '124' },
          { text: '144', correct: true },
          { text: '132' },
          { text: '154' },
        ],
        time: 10,
      },
      {
        type: 'TYPE_ANSWER',
        prompt: '¿Cuál es la raíz cuadrada de 81?',
        accepted: ['9', 'nueve'],
        time: 15,
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'El número 1 es primo.',
        options: [{ text: 'Verdadero' }, { text: 'Falso', correct: true }],
        explanation: 'Un primo tiene exactamente dos divisores; el 1 solo tiene uno.',
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál es el 25 % de 80?',
        options: [{ text: '15' }, { text: '20', correct: true }, { text: '25' }, { text: '40' }],
        time: 15,
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuántos grados suman los ángulos interiores de un triángulo?',
        options: [
          { text: '90°' },
          { text: '180°', correct: true },
          { text: '270°' },
          { text: '360°' },
        ],
      },
    ],
  },
  {
    author: 'cine_maniaco',
    title: 'Clásicos del cine',
    description: 'Directores, frases míticas y escenas que marcaron la historia del séptimo arte.',
    category: 'movies',
    language: 'es',
    difficulty: 'MEDIUM',
    theme: 'candy',
    tags: ['películas', 'cine', 'clásicos'],
    daysAgo: 15,
    plays: 1290,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Quién dirigió "Jurassic Park" (1993)?',
        options: [
          { text: 'James Cameron' },
          { text: 'Steven Spielberg', correct: true },
          { text: 'George Lucas' },
          { text: 'Ridley Scott' },
        ],
      },
      {
        type: 'TRUE_FALSE',
        prompt: '"Titanic" ganó 11 premios Óscar.',
        options: [{ text: 'Verdadero', correct: true }, { text: 'Falso' }],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿En qué película se dice "Que la Fuerza te acompañe"?',
        options: [
          { text: 'Star Wars', correct: true },
          { text: 'Star Trek' },
          { text: 'Matrix' },
          { text: 'Dune' },
        ],
      },
      {
        type: 'TYPE_ANSWER',
        prompt: '¿Cómo se llama el juguete vaquero protagonista de "Toy Story"?',
        accepted: ['Woody', 'Sheriff Woody'],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Qué director mexicano ganó el Óscar por "La forma del agua"?',
        options: [
          { text: 'Alfonso Cuarón' },
          { text: 'Alejandro G. Iñárritu' },
          { text: 'Guillermo del Toro', correct: true },
          { text: 'Luis Buñuel' },
        ],
      },
    ],
  },
  {
    author: 'cine_maniaco',
    title: 'Fútbol mundial: leyendas y mundiales',
    description: 'Copas del Mundo, goleadores históricos y momentos inolvidables del fútbol.',
    category: 'sports',
    language: 'es',
    difficulty: 'HARD',
    theme: 'arctic',
    tags: ['fútbol', 'mundial', 'deportes'],
    daysAgo: 2,
    plays: 650,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Qué país ha ganado más Copas del Mundo?',
        options: [
          { text: 'Alemania' },
          { text: 'Brasil', correct: true },
          { text: 'Argentina' },
          { text: 'Italia' },
        ],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Quién es el máximo goleador en la historia de los Mundiales?',
        options: [
          { text: 'Pelé' },
          { text: 'Ronaldo Nazário' },
          { text: 'Miroslav Klose', correct: true },
          { text: 'Lionel Messi' },
        ],
        points: 'DOUBLE',
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'El primer Mundial se jugó en Uruguay en 1930.',
        options: [{ text: 'Verdadero', correct: true }, { text: 'Falso' }],
      },
      {
        type: 'TYPE_ANSWER',
        prompt: '¿Qué selección ganó el Mundial de 2010?',
        accepted: ['España', 'Selección de España'],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuántos jugadores tiene un equipo en el campo?',
        options: [{ text: '9' }, { text: '10' }, { text: '11', correct: true }, { text: '12' }],
        time: 10,
      },
    ],
  },
  {
    author: 'trivia_queen',
    title: 'World Music Hits',
    description: 'From rock legends to K-pop: test your pop music knowledge!',
    category: 'music',
    language: 'en',
    difficulty: 'EASY',
    theme: 'neon',
    tags: ['music', 'pop', 'bands'],
    daysAgo: 9,
    plays: 1530,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: 'Which band recorded "Bohemian Rhapsody"?',
        options: [
          { text: 'The Beatles' },
          { text: 'Queen', correct: true },
          { text: 'Led Zeppelin' },
          { text: 'ABBA' },
        ],
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'Shakira is from Colombia.',
        options: [{ text: 'True', correct: true }, { text: 'False' }],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: 'Which K-pop group sang "Dynamite"?',
        options: [
          { text: 'BLACKPINK' },
          { text: 'BTS', correct: true },
          { text: 'EXO' },
          { text: 'TWICE' },
        ],
      },
      {
        type: 'TYPE_ANSWER',
        prompt: 'Who is known as the "King of Pop"?',
        accepted: ['Michael Jackson', 'MJ'],
      },
      {
        type: 'POLL',
        prompt: 'Which decade had the best music?',
        options: [{ text: '70s' }, { text: '80s' }, { text: '90s' }, { text: '2000s' }],
      },
    ],
  },
  {
    author: 'trivia_queen',
    title: 'Tech & Internet Trivia',
    description:
      'Programming languages, internet history and the companies that changed the world.',
    category: 'technology',
    language: 'en',
    difficulty: 'HARD',
    theme: 'pixel',
    tags: ['technology', 'internet', 'programming'],
    daysAgo: 4,
    plays: 870,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: 'What does "HTML" stand for?',
        options: [
          { text: 'HyperText Markup Language', correct: true },
          { text: 'High Transfer Machine Language' },
          { text: 'Home Tool Markup Language' },
          { text: 'Hyperlink Text Mode Language' },
        ],
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: 'Which language runs natively in web browsers?',
        options: [
          { text: 'Python' },
          { text: 'JavaScript', correct: true },
          { text: 'C#' },
          { text: 'Go' },
        ],
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'The first website went online in 1991.',
        options: [{ text: 'True', correct: true }, { text: 'False' }],
        explanation: 'Tim Berners-Lee published it at CERN in August 1991.',
      },
      {
        type: 'TYPE_ANSWER',
        prompt: 'How many bits are in a byte?',
        accepted: ['8', 'eight'],
        time: 10,
      },
      {
        type: 'MULTIPLE_CHOICE',
        prompt: 'Which of these are version control systems?',
        multi: true,
        options: [
          { text: 'Git', correct: true },
          { text: 'Docker' },
          { text: 'Mercurial', correct: true },
          { text: 'Subversion', correct: true },
        ],
        time: 30,
        points: 'DOUBLE',
      },
    ],
  },
  {
    author: 'explora_mundo',
    title: 'Rompehielos para equipos',
    description:
      'Encuestas divertidas para empezar reuniones, talleres o clases con buena energía. ¡Sin respuestas incorrectas!',
    category: 'general',
    language: 'es',
    difficulty: 'EASY',
    theme: 'candy',
    tags: ['rompehielos', 'equipos', 'plantilla'],
    daysAgo: 1,
    plays: 310,
    questions: [
      {
        type: 'POLL',
        prompt: '¿Café o té para empezar el día?',
        options: [{ text: '☕ Café' }, { text: '🍵 Té' }, { text: '🥤 Ninguno' }],
      },
      {
        type: 'POLL',
        prompt: 'Si pudieras tener un superpoder, ¿cuál sería?',
        options: [
          { text: 'Volar' },
          { text: 'Teletransporte' },
          { text: 'Leer mentes' },
          { text: 'Invisibilidad' },
        ],
      },
      {
        type: 'POLL',
        prompt: '¿Playa o montaña?',
        options: [{ text: '🏖️ Playa' }, { text: '🏔️ Montaña' }],
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'Las reuniones con quiz son más divertidas.',
        options: [{ text: 'Verdadero', correct: true }, { text: 'Falso' }],
      },
    ],
  },
  {
    author: 'demo',
    title: 'Tour de Quiz_Rush: los 14 tipos de pregunta',
    description:
      'Un recorrido divertido por todos los tipos de pregunta: ordenar, emparejar, deslizador, mapa, dibujo, nube de palabras y más. Ideal para probar los modos de juego.',
    category: 'general',
    language: 'es',
    difficulty: 'EASY',
    theme: 'space',
    tags: ['demo', 'tipos', 'multijugador'],
    daysAgo: 1,
    plays: 42,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        prompt: '¿Cuál es el planeta más grande del sistema solar?',
        options: [
          { text: 'Júpiter', correct: true },
          { text: 'Saturno' },
          { text: 'Tierra' },
          { text: 'Neptuno' },
        ],
        hint: 'Tiene una Gran Mancha Roja',
        explanation: 'Júpiter es tan grande que cabrían dentro más de 1.300 Tierras.',
      },
      {
        type: 'TRUE_FALSE',
        prompt: 'Los pulpos tienen tres corazones.',
        options: [{ text: 'Verdadero', correct: true }, { text: 'Falso' }],
        explanation: 'Dos bombean sangre a las branquias y uno al resto del cuerpo.',
      },
      {
        type: 'TYPE_ANSWER',
        prompt: '¿Cuál es la capital de Japón?',
        accepted: ['Tokio', 'Tokyo'],
        hint: 'Empieza por T',
      },
      {
        type: 'ORDER',
        prompt: 'Ordena del más pequeño al más grande',
        options: [
          { text: '🐜 Hormiga' },
          { text: '🐈 Gato' },
          { text: '🐎 Caballo' },
          { text: '🐘 Elefante' },
        ],
        explanation: 'De milímetros a varias toneladas.',
      },
      {
        type: 'MATCH',
        prompt: 'Empareja cada país con su capital',
        config: {
          pairs: [
            { id: 'p-fr', left: 'Francia', right: 'París' },
            { id: 'p-it', left: 'Italia', right: 'Roma' },
            { id: 'p-pe', left: 'Perú', right: 'Lima' },
            { id: 'p-eg', left: 'Egipto', right: 'El Cairo' },
          ],
        },
        time: 40,
      },
      {
        type: 'SLIDER',
        prompt: '¿A qué temperatura hierve el agua al nivel del mar?',
        config: { slider: { min: 0, max: 200, step: 5, correct: 100, tolerance: 10, unit: '°C' } },
        explanation: 'A 100 °C con presión normal; en la montaña hierve antes.',
      },
      {
        type: 'PIN',
        prompt: 'Toca el faro de la Isla Rush',
        config: { pin: { imageUrl: '/demo/isla.svg', x: 75, y: 25, radius: 10 } },
        hint: 'Está en la costa, al noreste',
      },
      {
        type: 'FILL_BLANK',
        prompt: 'El agua está formada por hidrógeno y ___.',
        config: { blanks: [['oxígeno', 'oxigeno', 'O']] },
      },
      {
        type: 'AUDIO',
        prompt: 'Escucha con atención: ¿cuántos pitidos suenan?',
        media: { kind: 'audio', url: '/demo/pitidos.wav' },
        options: [{ text: '3' }, { text: '4', correct: true }, { text: '5' }, { text: '6' }],
        time: 30,
      },
      {
        type: 'REVEAL_IMAGE',
        prompt: '¿Qué planeta se esconde detrás de las piezas?',
        media: { kind: 'image', url: '/demo/planeta.svg' },
        options: [
          { text: 'Saturno', correct: true },
          { text: 'Marte' },
          { text: 'Venus' },
          { text: 'Mercurio' },
        ],
        config: { revealTiles: 16 },
        time: 30,
      },
      {
        type: 'POLL',
        prompt: '¿Qué modo de juego te gusta más?',
        options: [
          { text: '❤️ Supervivencia' },
          { text: '🐉 Jefe final' },
          { text: '🏎️ Carrera' },
          { text: '⚔️ Torneo' },
        ],
      },
      {
        type: 'WORD_CLOUD',
        prompt: 'Describe Quiz_Rush con una palabra',
        config: { maxWords: 2 },
        time: 30,
      },
      {
        type: 'OPEN_VOTE',
        prompt: 'Inventa un lema para nuestra clase',
        time: 60,
      },
      {
        type: 'DRAW',
        prompt: '¡Dibuja la palabra secreta!',
        config: { drawWords: ['sol', 'gato', 'casa', 'pez', 'cohete', 'árbol'] },
        time: 60,
      },
    ],
  },
  {
    author: 'demo',
    title: 'Borrador: Historia de los videojuegos',
    description:
      'Quiz a medio hacer para comprobar que los borradores no aparecen en la Biblioteca.',
    category: 'gaming',
    language: 'es',
    difficulty: 'HARD',
    theme: 'pixel',
    tags: ['retro'],
    daysAgo: 0,
    plays: 0,
    draft: true,
    questions: [
      { type: 'MULTIPLE_CHOICE', prompt: '', options: [{ text: '', correct: true }, { text: '' }] },
    ],
  },
];

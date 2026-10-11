/**
 * Curated High-Resolution Editorial Atmosphere Stock Collection
 * Guaranteed zero-latency, high-quality Unsplash photos across all creator niches.
 */

export interface CuratedPhoto {
  id: string;
  url: string;
  thumbUrl: string;
  previewUrl: string;
  proxyUrl: string;
  description: string;
  category: string;
  photographer: {
    name: string;
    username: string;
    profileUrl: string;
  };
  source: 'curated' | 'unsplash' | 'pexels';
}

export const CURATED_STOCK_PHOTOS: CuratedPhoto[] = [
  // --- Workspace & Studio ---
  {
    id: 'curated-ws-1',
    url: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1524758631624-e2822e304c36%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Minimalist Scandinavian studio workspace with warm natural light',
    category: 'workspace',
    photographer: { name: 'Kari Shea', username: 'karishea', profileUrl: 'https://unsplash.com/@karishea' },
    source: 'curated',
  },
  {
    id: 'curated-ws-2',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1497366216548-37526070297c%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Sleek executive boardroom with glass architecture',
    category: 'workspace',
    photographer: { name: 'Nastuh Abootalebi', username: 'nastuh', profileUrl: 'https://unsplash.com/@nastuh' },
    source: 'curated',
  },
  {
    id: 'curated-ws-3',
    url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1507238691740-187a5b1d37b8%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Moody developer desk with mechanical keyboard and notebook',
    category: 'workspace',
    photographer: { name: 'Ales Nesetril', username: 'nesetril', profileUrl: 'https://unsplash.com/@nesetril' },
    source: 'curated',
  },
  {
    id: 'curated-ws-4',
    url: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1497215728101-856f4ea42174%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Modern clean office interior with monitor setup',
    category: 'workspace',
    photographer: { name: 'Alesia Kazantceva', username: 'kayacreative', profileUrl: 'https://unsplash.com/@kayacreative' },
    source: 'curated',
  },

  // --- Architecture & Monolith ---
  {
    id: 'curated-arch-1',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1513694203232-719a280e022f%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Clean architectural shadows on raw concrete wall',
    category: 'architecture',
    photographer: { name: 'Simone Hutsch', username: 'simone_hutsch', profileUrl: 'https://unsplash.com/@simone_hutsch' },
    source: 'curated',
  },
  {
    id: 'curated-arch-2',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1486406146926-c627a92ad1ab%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Glass monolith corporate high-rise skyscraper',
    category: 'architecture',
    photographer: { name: 'Sean Pollock', username: 'seanpollock', profileUrl: 'https://unsplash.com/@seanpollock' },
    source: 'curated',
  },
  {
    id: 'curated-arch-3',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1600585154340-be6161a56a0c%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Modern luxury interior with warm wood and stone',
    category: 'architecture',
    photographer: { name: 'R Architecture', username: 'rarchitecture', profileUrl: 'https://unsplash.com/@rarchitecture' },
    source: 'curated',
  },
  {
    id: 'curated-arch-4',
    url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506157786151-b8491531f063%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Brutalist concrete geometric archways and light',
    category: 'architecture',
    photographer: { name: 'Joel Filipe', username: 'joelfilip', profileUrl: 'https://unsplash.com/@joelfilip' },
    source: 'curated',
  },

  // --- Abstract Neon & Cyber Glow ---
  {
    id: 'curated-neon-1',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1509198397868-475647b2a1e5%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Electric cyan and violet geometric night atmosphere',
    category: 'neon',
    photographer: { name: 'Florian Olivo', username: 'florianolivo', profileUrl: 'https://unsplash.com/@florianolivo' },
    source: 'curated',
  },
  {
    id: 'curated-neon-2',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1550745165-9bc0b252726f%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Vintage retro computing tech setup with magenta glow',
    category: 'neon',
    photographer: { name: 'Lorenzo Herrera', username: 'lorenzoherrera', profileUrl: 'https://unsplash.com/@lorenzoherrera' },
    source: 'curated',
  },
  {
    id: 'curated-neon-3',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1518770660439-4636190af475%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'High-density microchip silicon motherboard circuitry',
    category: 'neon',
    photographer: { name: 'Alexandre Debiève', username: 'alexandre_debieve', profileUrl: 'https://unsplash.com/@alexandre_debieve' },
    source: 'curated',
  },
  {
    id: 'curated-abs-1',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1618005182384-a83a8bd57fbe%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Fluid organic 3D glass waves in deep obsidian and cream',
    category: 'neon',
    photographer: { name: 'Milad Fakurian', username: 'fakurian', profileUrl: 'https://unsplash.com/@fakurian' },
    source: 'curated',
  },

  // --- Minimalist Nature & Atmospheric Moody ---
  {
    id: 'curated-nat-1',
    url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1470071459604-3b5ec3a7fe05%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Misty golden hour mountain valley landscape',
    category: 'nature',
    photographer: { name: 'V2F Photography', username: 'v2f', profileUrl: 'https://unsplash.com/@v2f' },
    source: 'curated',
  },
  {
    id: 'curated-nat-2',
    url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1518495973542-4542c06a5843%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Warm cinematic sun rays piercing through forest canopy',
    category: 'nature',
    photographer: { name: 'Casey Horner', username: 'mancity3827', profileUrl: 'https://unsplash.com/@mancity3827' },
    source: 'curated',
  },
  {
    id: 'curated-nat-3',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1448375240586-882707db888b%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Deep evergreen pine forest shrouded in dense mist',
    category: 'nature',
    photographer: { name: 'Sebastian Unrau', username: 'sebastian_unrau', profileUrl: 'https://unsplash.com/@sebastian_unrau' },
    source: 'curated',
  },
  {
    id: 'curated-nat-4',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506744038136-46273834b3fb%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Dramatic alpine lake reflection with pristine water',
    category: 'nature',
    photographer: { name: 'Bailey Zindel', username: 'baileyzindel', profileUrl: 'https://unsplash.com/@baileyzindel' },
    source: 'curated',
  },

  // --- Lifestyle, Coffee & Creator Culture ---
  {
    id: 'curated-life-1',
    url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1495474472287-4d71bcdd2085%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Warm artisan specialty espresso coffee craft in ceramic cup',
    category: 'lifestyle',
    photographer: { name: 'Nathan Dumlao', username: 'nate_dumlao', profileUrl: 'https://unsplash.com/@nate_dumlao' },
    source: 'curated',
  },
  {
    id: 'curated-life-2',
    url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1512820790803-83ca734da794%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Hardcover book stack on clean wooden table with morning light',
    category: 'lifestyle',
    photographer: { name: 'Thought Catalog', username: 'thoughtcatalog', profileUrl: 'https://unsplash.com/@thoughtcatalog' },
    source: 'curated',
  },
  {
    id: 'curated-life-3',
    url: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1499750310107-5fef28a66643%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Laptop computer on rustic table beside fresh brewed coffee',
    category: 'lifestyle',
    photographer: { name: 'Andrew Neel', username: 'andrewtneel', profileUrl: 'https://unsplash.com/@andrewtneel' },
    source: 'curated',
  },
  {
    id: 'curated-life-4',
    url: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1544717305-2782549b5136%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Minimal writing journal with glasses and gold fountain pen',
    category: 'lifestyle',
    photographer: { name: 'Hope House Press', username: 'hopehousepress', profileUrl: 'https://unsplash.com/@hopehousepress' },
    source: 'curated',
  },

  // --- Dark Minimal & Atmospheric Stone ---
  {
    id: 'curated-dark-1',
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1550684848-fac1c5b4e853%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Deep textured charcoal stone with subtle vignette',
    category: 'architecture',
    photographer: { name: 'Pawel Czerwinski', username: 'pawel_czerwinski', profileUrl: 'https://unsplash.com/@pawel_czerwinski' },
    source: 'curated',
  },
  {
    id: 'curated-dark-2',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=75',
    previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    proxyUrl: '/api/proxy-media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1618005182384-a83a8bd57fbe%3Fauto%3Dformat%26fit%3Dcrop%26w%3D1600%26q%3D85',
    description: 'Liquid glass ribbons in deep obsidian night',
    category: 'neon',
    photographer: { name: 'Milad Fakurian', username: 'fakurian', profileUrl: 'https://unsplash.com/@fakurian' },
    source: 'curated',
  },
];

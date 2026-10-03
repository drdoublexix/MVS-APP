// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

const SPECIES_TIPS: Record<string, string[]> = {
  dog: [
    "Check your dog's paws after outdoor walks for cuts, thorns, or irritation. 🐾",
    "Give your dog a short training session today to keep their body and mind active. 🐕",
    "Never leave chocolate, grapes, or xylitol within your dog's reach. 🚫",
    "Ensure your dog's drinking bowl is washed and refilled with fresh water at least twice daily. 💧",
    "Incorporate a 20-to-30 minute brisk walk to maintain joint mobility and a healthy weight. 🏃‍♂️",
    "Inspect your dog's ears weekly for any unusual redness, foul odor, or dark wax build-up. 👂",
    "Brush your dog's coat regularly to reduce shedding and distribute natural healthy oils. 🧹",
    "Introduce dental chews or practice gentle teeth brushing to prevent periodontal disease. 🪥",
    "Verify that your dog's rabies and annual combination booster shots are current on MVS. 💉",
    "Check your dog's collar or harness fit to ensure it isn't too tight or rubbing the skin. 🏷️",
    "Provide interactive puzzle toys or snuffle mats to keep your dog mentally stimulated indoors. 🧩",
    "Avoid feeding table scraps containing high fat content to prevent acute pancreatitis. 🥩",
    "Never leave your dog unattended inside a parked vehicle, even for a few minutes on cool days. 🚗",
    "Wipe away morning eye discharge gently using a warm, damp, clean cloth. ✨",
    "Check your dog's nails; if they click loudly against hard floors, it's time for a trim. ✂️",
    "Keep household cleaning chemicals, detergents, and insecticides locked safely away. 🔐",
    "Provide a designated, comfortable resting bed away from heavy household foot traffic. 🛌",
    "Rotate your dog's toys weekly to keep them feeling novel and engaging. 🧸",
    "Socialize your dog safely with friendly animals and people to maintain good temperament. 🤝",
    "Inspect your yard or living space for toxic indoor/outdoor plants like lilies or ivy. 🪴",
    "Monitor your dog's daily water intake; sudden spikes can indicate underlying kidney or metabolic issues. 🥛",
    "Practice calm, positive reinforcement to handle your dog's paws easily for future nail clipping. 🐾",
    "Ensure electrical cords and chargers are securely tucked away from teething puppies. 🔌",
    "Check your dog's elbows and joints for any stiffness or hesitation when rising from rest. 🦵",
    "Keep trash cans tightly sealed and covered so curious sniffers cannot access spoiled food. 🗑️",
    "Schedule routine anti-parasite treatments for fleas, ticks, and worms with your veterinarian. 🛡️",
    "Protect your dog from extreme weather by providing shaded shelter and cool resting tiles in summer. ☀️",
    "Reward calm behavior during doorbells or visitors to encourage steady, relaxed manners. 🚪",
    "Keep your emergency vet contact details saved and easily accessible on your phone. 📞",
    "Spend 10 uninterrupted minutes of quality bonding or cuddle time with your companion daily. ❤️"
  ],
  cat: [
    "Refresh your cat's water and scoop the litter box today. A clean setup supports good health. 🐈",
    "Offer your cat a few minutes of play with a wand or toy to support healthy activity. 🎾",
    "Check your cat's appetite and litter habits for sudden changes. 🩺",
    "Cats often prefer running water or fresh sources; consider a pet water fountain. ⛲",
    "Ensure your feline friend has high vertical perches or cat trees to observe their environment. 🏡",
    "Scoop solid waste from the litter box at least once daily to prevent avoidance behaviors. 🐈‍⬛",
    "Brush your cat's coat regularly, especially longhairs, to prevent painful hairballs. 🧹",
    "Inspect your cat's ears for black debris or scratching, which can signal ear mites. 👂",
    "Keep all human medications, particularly painkillers, strictly out of reach of cats. 💊",
    "Provide sturdy vertical scratching posts to keep claws healthy and stretch spinal muscles. 🐾",
    "Never give cats cow's milk, as many adult cats are lactose intolerant and get stomach upsets. 🥛",
    "Check your cat's weight; feline obesity increases the risk of diabetes and joint strain. ⚖️",
    "Leave clean cardboard boxes out for your cat to safely explore and hide in. 📦",
    "Verify your cat's microchip contact information is fully updated on your records. 🏷️",
    "Watch out for subtle behavior shifts—cats naturally hide pain or vulnerability. 🩺",
    "Wipe crust away from your cat's eyes gently with a damp cotton pad. ✨",
    "Ensure toxic houseplants like lilies, poinsettias, and dieffenbachia are kept away. 🪴",
    "Engage your cat's predatory instincts with interactive feathery or laser play sessions. 🶶",
    "Check your cat's teeth and gums for signs of gingivitis, redness, or bad breath. 👄",
    "Keep windows securely screened to prevent accidental falls from high-rise balconies. 🪟",
    "Provide a quiet, undisturbed hiding space where your cat can retreat when stressed. 🛌",
    "Clean and sanitize food bowls daily to prevent feline acne around the chin. 🧼",
    "Monitor litter box output closely for straining or blockages, which are serious emergencies. 🚨",
    "Keep nylon hair ties, rubber bands, and string away from cats to prevent bowel obstructions. 🚫",
    "Offer high-protein, balanced wet food options to support optimal urinary tract health. 🍲",
    "Maintain a predictable daily feeding and play routine to reduce feline anxiety. ⏱️",
    "Schedule routine deworming and core vaccinations as recommended by your vet. 💉",
    "Gently handle your cat's paws regularly to make future claw clipping stress-free. ✂️",
    "Inspect your cat's skin and fur for any unusual scabs, lumps, or flea dirt. 🔍",
    "Show affection through slow blinking and gentle chin scratches to build trust. ✨"
  ],
  rabbit: [
    "Make sure your rabbit has unlimited clean hay and fresh water today. 🐇",
    "Check your rabbit's enclosure for damp bedding and remove anything soiled. 🧼",
    "Offer safe leafy greens to your rabbit and avoid sudden diet changes. 🌿",
    "Check your rabbit's incisor teeth weekly to ensure they aren't overgrown or misaligned. 🦷",
    "Provide wooden chew blocks or willow balls to help wear down growing teeth naturally. 🪵",
    "Keep your rabbit's hutch out of direct scorching sunlight and drafts. 🌤️",
    "Clean water bottles and crocks daily to prevent algae and bacterial growth in the nozzle. 💧",
    "Inspect your rabbit's bottom daily for signs of flystrike or soiled fur, especially in warm weather. 🪰",
    "Provide ample floor space for your rabbit to hop, stretch, and display natural behaviors. 🏃",
    "Brush your rabbit's coat during shedding seasons to prevent wool block in their stomach. 🧹",
    "Handle rabbits gently and support their hindquarters at all times to prevent spine injury. 🤲",
    "Feed commercial pellets in measured amounts rather than free-feeding to prevent obesity. 🥣",
    "Check your rabbit's ears inside and out for mites, scaling, or head tilting. 👂",
    "Ensure all enclosure wiring and mesh are secure against outside predators like rats or cats. 🛡️",
    "Provide tunnels or cardboard boxes for hiding and satisfying natural burrowing instincts. 📦",
    "Monitor your rabbit's fecal output daily; smaller or absent droppings can signal gut stasis. ⚠️",
    "Keep toxic garden plants like tomatoes, potatoes greens, and ivy away from run areas. 🚫",
    "Incorporate fresh herbs like parsley, cilantro, or basil as occasional healthy treats. 🌿",
    "Check your rabbit's hutch flooring to ensure wire grids aren't causing sore hocks. 🐾",
    "Keep your rabbit's environment calm, as loud noises can easily induce severe panic. 🤫",
    "Verify that your rabbit's living quarters remain well-ventilated to prevent respiratory issues. 💨",
    "Inspect hutch latches and roofs to ensure rain and predators cannot break in. 🏡",
    "Provide fresh apple tree branches (un-sprayed) for safe chewing and environmental enrichment. 🍎",
    "Clean litter boxes daily using pet-safe, non-toxic cleaning agents. 🧽",
    "Check for any sudden lethargy or refusal to eat, requiring immediate veterinary attention. 🩺",
    "Allow supervised out-of-cage roaming time in a bunny-proofed room daily. 🛋️",
    "Ensure electrical wires near floor level are completely blocked off from chewing. 🔌",
    "Monitor hutch temperature during extreme weather shifts, keeping it cool or insulated. 🌡️",
    "Keep multi-rabbit groups monitored to ensure harmonious bonding and prevent fighting. 🤝",
    "Record health milestones and treatment schedules on MVS to stay fully organized. 📊"
  ],
  goat: [
    "Check your goats' water supply and inspect their shelter before the day gets hot. 🐐",
    "Look over your goats for limping, unusual swelling, or changes in appetite. 🩺",
    "Keep feed storage dry and secure so your goats receive clean, safe nutrition. 🌾",
    "Check fences and gates daily to ensure secure boundaries and prevent escape. 🧱",
    "Inspect your goats' hooves regularly and trim them as needed to prevent foot rot. ✂️",
    "Provide loose mineral blocks specifically formulated for goats to prevent deficiencies. 🧱",
    "Ensure goat housing is draft-free, dry, and offers enough room for every animal to lie down. 🏠",
    "Check for signs of internal parasites through routine fecal checks with your vet. 🔬",
    "Clear pens of any sharp metal edges, protruding nails, or toxic plants like oleander. 🚫",
    "Monitor pregnant does closely for signs of approaching labor or pregnancy toxemia. 🍼",
    "Provide clean, elevated wooden resting platforms inside the pen to satisfy natural climbing instincts. 🪵",
    "Keep mineral feeders sheltered from rain so supplements don't clump or spoil. 🌧️",
    "Check water troughs for algae buildup and scrub them clean weekly. 🧽",
    "Observe herd hierarchy during feeding time to ensure timid goats get their share. 🍽️",
    "Examine kid goats for early signs of scours or respiratory distress and isolate if needed. 🩺",
    "Inspect fiber and coat condition for dullness, lice, or mite infestations. 🔍",
    "Rotate grazing paddocks when possible to reduce parasite burdens on pastures. 🌿",
    "Feed only clean, mold-free hay; moldy forage causes severe ruminal toxicity and illness. 🍞",
    "Check horns and horn bases for injuries or rubbing against panels. 🪖",
    "Ensure bucks are safely contained in sturdy fencing separate from milking or pregnant does. 🚧",
    "Provide ample roughage to maintain healthy rumen fermentation and digestion. 🌱",
    "Look out for sudden bloating after turning goats onto lush, green legume pastures. 🎈",
    "Administer scheduled vaccinations and clostridial boosters on time. 💉",
    "Keep records of breeding dates, kidding results, and medical treatments on MVS. 📊",
    "Check lighting and ventilation in indoor barns during humid weather. 💡",
    "Provide scratching brushes mounted to walls so goats can groom themselves safely. 🪵",
    "Verify that waste manure is cleared regularly to maintain low ammonia levels in barns. 🧹",
    "Watch for coughing or nasal discharge, treating respiratory issues early. 💨",
    "Ensure kids receive adequate colostrum within the first hours of life. 🍼",
    "Handle goats calmly to build trust, making routine health checks much simpler. ✨"
  ],
  poultry: [
    "Refresh your poultry's drinking water and check the coop for wet or dirty bedding. 🐔",
    "Inspect your flock for lethargy, coughing, or unusual droppings and contact a vet early. 🩺",
    "Secure your poultry enclosure against predators before dusk. 🛡️",
    "Check nesting boxes daily, collecting eggs clean and unbroken. 🥚",
    "Sanitize poultry waterers and feeders regularly to prevent bacterial and algal slime. 💧",
    "Ensure coop ventilation is optimal at upper wall levels without creating direct drafts on birds. 🌬️",
    "Check bird skin and feathers around the vent and under wings for lice or red mites. 🪲",
    "Provide clean, dry litter material like wood shavings, turning damp spots over. 🪵",
    "Ensure feeders provide enough linear space so lower-ranking birds can eat peacefully. 🌾",
    "Check flock calcium and grit supply to ensure strong eggshells and healthy gizzard digestion. 🪨",
    "Inspect fencing and wire mesh for holes where rodents or predators could squeeze through. 🕳️",
    "Quarantine any newly introduced birds for at least two weeks before mixing with the flock. 🚧",
    "Monitor egg production trends; sudden drops can indicate stress, heat, or disease. 📉",
    "Keep feed bins tightly sealed to keep out wild birds, mice, and moisture. 🔒",
    "Check perches to ensure they are stable, smooth, and high enough off the ground. 🪵",
    "Provide shade sails or covered runs to protect birds from scorching midday heat. ☀️",
    "Examine legs and scales for scaly leg mites, treating promptly with safe oils. 🔍",
    "Dispose of spoiled or wet feed immediately to prevent mycotoxin poisoning. 🗑️",
    "Keep biosecurity protocols strict: clean boots and wash hands before entering runs. 🥾",
    "Check lighting duration in laying houses if using supplemental winter light. 💡",
    "Look out for feather pecking or cannibalism behaviors, adjusting space or enrichment. 🪶",
    "Administer scheduled Newcastle disease and other flock vaccinations on time. 💉",
    "Ensure young chicks have reliable brooder warmth adjusted to their exact age. 🔥",
    "Check beak conditions and ensure birds can forage and drink comfortably. 🐥",
    "Clear mud puddles around outdoor waterers to prevent muddy foot infections. 🌧️",
    "Provide dust-bathing areas with dry soil and diatomaceous earth for parasite control. 🛁",
    "Monitor flock breathing sounds closely for any gurgling or wheezing noises. 🫁",
    "Keep accurate records of flock inventory, medication dates, and egg yields on MVS. 📊",
    "Remove broken eggshells immediately from nests to prevent birds from developing egg-eating habits. 🍳",
    "Check perimeter door latches every evening to ensure total nighttime predator safety. 🌙"
  ],
  cattle: [
    "Check your cattle's water points and look for any animal separated from the herd. 🐄",
    "Walk through your cattle area for broken fencing or hazards before grazing. 🐂",
    "Monitor your cattle for changes in appetite, movement, or breathing. 🩺",
    "Check mineral and salt lick stations to ensure cattle have free access to trace elements. 🧱",
    "Inspect herd hooves and check for signs of lameness, foot rot, or stone bruises. 🪨",
    "Ensure handling chutes and gates are sturdy, safe, and free of sharp protrusions. 🚧",
    "Provide adequate shaded resting areas in pastures during high heat index days. 🌳",
    "Check water troughs daily to ensure pumps are working and water is cool and clean. 💧",
    "Monitor body condition scores across the herd to adjust feed supplementation correctly. ⚖️",
    "Keep pasture gates secured and check boundary lines weekly. 🪵",
    "Examine cattle coats for smooth shine or signs of lice, ticks, or rain rot. 🔍",
    "Observe cows chewing their cud at rest to ensure normal rumen function. 🌾",
    "Check calves for early signs of scours, navel infection, or respiratory illness. 🍼",
    "Keep mineral supplements dry and safe from weather damage. 🌧️",
    "Rotate pastures strategically to manage internal parasite cycles effectively. 🌿",
    "Inspect feed bunks for old, moldy leftover feed and clean them out. 🧼",
    "Ensure fly control measures (ear tags, rubs, or sprays) are active during fly season. 🪰",
    "Watch out for toxic weeds or poisonous plants in newly opened grazing sectors. 🚫",
    "Maintain up-to-date individual ear tag records and health histories on MVS. 📊",
    "Keep bulls safely penned in secure, reinforced holding facilities. 🐂",
    "Check overhead power lines and tree branches near pastures for storm damage risks. ⚡",
    "Administer scheduled blackleg and anthrax booster vaccinations on schedule. 💉",
    "Inspect calving pastures daily for any assistance needed during delivery. 🐄",
    "Ensure proper disposal of dead stock away from water sources and livestock zones. 🚯",
    "Check cattle breathing patterns for any deep labored huffing or persistent coughing. 🫁",
    "Provide scratch brushes or rubbing posts in paddocks to reduce stress. 🪵",
    "Ensure trailer transport vehicles are clean, bedded, and safe before moving cattle. 🚚",
    "Monitor milking hygiene strictly to prevent mastitis outbreaks in dairy cows. 🥛",
    "Store harvested hay bales on pallets away from damp ground to prevent spontaneous combustion or mold. 📦",
    "Spend time quietly observing herd demeanor daily to catch subtle behavioral changes early. 👀"
  ],
  sheep: [
    "Check your sheep for limping, poor appetite, or unusual separation from the flock. 🐑",
    "Keep your sheep's shelter dry and well ventilated to support healthy breathing. 🌾",
    "Inspect your sheep's water containers and clean away algae or debris. 💧",
    "Check fleece condition and schedule routine shearing to prevent heat stress and flystrike. ✂️",
    "Inspect hooves for overgrown walls or rot, trimming and treating promptly. 🪵",
    "Provide copper-safe mineral supplements tailored specifically for sheep needs. 🧱",
    "Ensure gates and fences are tightly latched to keep predators like dogs out. 🛡️",
    "Monitor ewes closely during lambing season for signs of dystocia or metabolic issues. 🍼",
    "Check for internal parasites via regular FAMACHA eye-scoring and fecal testing. 🔬",
    "Keep feed troughs clean and avoid sudden changes in concentrate rations. 🥣",
    "Provide adequate shade trees or open-sided shelters during hot summer days. 🌳",
    "Inspect the flock for signs of pinkeye (infectious keratoconjunctivitis) and isolate cases. 👀",
    "Ensure lambs receive colostrum within hours of birth for strong immunity. 🍼",
    "Keep bedding clean and dry in lambing jugs to prevent navel ill infections. 🧽",
    "Check for wool blindness around the eyes of woolly breeds, trimming wool if needed. ✨",
    "Monitor salt block consumption to ensure adequate mineral intake. 🧂",
    "Rotate grazing lands to break the life cycle of stomach worms. 🌿",
    "Check rams for soundness, breeding fitness, and horn-rubbing injuries. 🪖",
    "Keep records of ewe tagging, lambing rates, and health treatments on MVS. 📊",
    "Watch out for bloat when turning hungry sheep onto rich clover or alfalfa. 🎈",
    "Keep backup water sources available in case primary lines fail. 🚰",
    "Check fence lines for loose wire strands that could entangle woolly coats. 🧶",
    "Ensure shearing tools and equipment are sanitized between animals. 🧼",
    "Monitor respiratory health, as sheep are very susceptible to dusty environments. 💨",
    "Keep mineral blocks protected from rain so they don't dissolve. 🌧️",
    "Look out for sudden lameness storms, treating footrot cases immediately. 🏃",
    "Provide scratching brushes to keep animals comfortable and reduce boredom. 🪵",
    "Administer clostridial and enterotoxemia vaccinations on schedule. 💉",
    "Inspect perimeter fencing every weekend for signs of digging or wear. 🚧",
    "Observe flock behavior at feeding time to ensure timid sheep aren't pushed away. 🍽️"
  ],
  pig: [
    "Make sure your pigs have clean water and a cool, shaded place to rest. 🐖",
    "Check your pigs' pen for sharp edges, standing water, or damaged fencing. 🛡️",
    "Watch your pigs for coughing, reduced appetite, or unusual skin changes. 🩺",
    "Provide wallows or sprinkler systems during hot weather since pigs cannot sweat. 💧",
    "Clean and sanitize troughs daily to prevent sour feed or bacterial contamination. 🧼",
    "Check flooring for slipperiness or abrasive concrete that could injure trotters. 🧱",
    "Ensure pens have deep, clean straw or bedding during chilly weather shifts. 🌾",
    "Inspect nipple drinkers or water bowls to ensure adequate pressure and flow rate. 🚰",
    "Monitor farrowing crates and sows closely to protect newborn piglets from crushing. 🍼",
    "Keep feed formulations balanced for growth stage, from starter to finisher rations. 🥣",
    "Check pig skin for mange, lice, or sunburns, applying protective oils or treatments. 🔍",
    "Secure gates firmly; pigs are clever and easily push open weak latches. 🚪",
    "Provide enrichment items like hanging chains or rubber toys to prevent tail biting. ⛓️",
    "Check ventilation fans and curtain setups in commercial or semi-intensive barns. 💨",
    "Isolate new stock in quarantine pens before introducing them to the main herd. 🚧",
    "Monitor manure pits or drainage channels to prevent harmful gas buildup in barns. ⚠️",
    "Examine tails and ears regularly for early signs of biting or aggressive chewing. ✂️",
    "Keep mineral and vitamin premixes thoroughly blended into daily feed rations. 🥗",
    "Check animal movement for stiffness or joint swelling indicative of arthritis. 🦵",
    "Ensure creep areas for piglets are warm, dry, and protected from sows. 🔥",
    "Dispose of spoiled or contaminated feed immediately to prevent digestive toxicosis. 🗑️",
    "Administer routine vaccinations for swine erysipelas and other regional diseases. 💉",
    "Keep complete herd performance and treatment logs updated on MVS. 📊",
    "Inspect perimeter fencing and concrete slabs for cracks or rooting damage. 🏗️",
    "Provide scratching posts or brushes so pigs can groom comfortably. 🪵",
    "Monitor group stocking densities to prevent overcrowding and stress fighting. 📉",
    "Check for persistent coughing or thumping respiration, treating respiratory illness early. 🫁",
    "Ensure iron shots are given to newborn piglets to prevent nutritional anemia. 💉",
    "Keep biosecurity barriers active: disinfect boots and control vehicle access. 🥾",
    "Observe daily herd activity levels to spot sluggish or isolated pigs right away. 👀"
  ],
};

const normalizeSpecies = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\/_-]+/g, ' ').replace(/\s+/g, ' ');
  const aliases: Record<string, string> = {
    dogs: 'dog',
    canine: 'dog',
    cats: 'cat',
    feline: 'cat',
    rabbits: 'rabbit',
    laprine: 'rabbit',
    goats: 'goat',
    caprine: 'goat',
    chickens: 'poultry',
    chicken: 'poultry',
    poultry: 'poultry',
    birds: 'poultry',
    bird: 'poultry',
    avian: 'poultry',
    'avian poultry': 'poultry',
    cows: 'cattle',
    cow: 'cattle',
    bovine: 'cattle',
    sheep: 'sheep',
    ovine: 'sheep',
    pigs: 'pig',
    swine: 'pig',
  };
  return aliases[normalized] || normalized;
};

const chooseRandomTip = (tips: string[]) => {
  const shuffledTips = [...tips];
  for (let index = shuffledTips.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledTips[index], shuffledTips[swapIndex]] = [shuffledTips[swapIndex], shuffledTips[index]];
  }
  return shuffledTips[0];
};

const sendExpoNotification = async (token: string, title: string, body: string, notificationId?: string) => {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title,
      body,
      data: { url: '/', notificationId },
    }),
  });

  return response.json();
};

const sendWebNotification = async (subscriptionString: string, title: string, body: string, notificationId?: string) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('Web push VAPID keys are not configured for this Edge Function.');
  }

  const parsedSubscription = JSON.parse(subscriptionString);
  webPush.setVapidDetails('mailto:admin@mvsapp.com.ng', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  await webPush.sendNotification(parsedSubscription, JSON.stringify({
    title,
    body,
    data: { url: '/', notificationId },
  }));
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey || req.headers.get('authorization') !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey
  );

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, expo_push_token, web_push_subscription');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const recipients = profiles || [];

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ message: 'No profiles found' }), { status: 200 });
  }

  const deliveryResults = [];

  for (const profile of recipients) {
    const outcome: Record<string, unknown> = { userId: profile.id };
    const [{ data: pets, error: petsError }, { data: farmRecords, error: farmRecordsError }] = await Promise.all([
      supabase.from('pets').select('type').eq('owner_id', profile.id),
      supabase.from('farm_records').select('species').eq('client_id', profile.id),
    ]);

    const species = new Set<string>();
    (pets || []).forEach((pet) => species.add(normalizeSpecies(pet.type)));
    (farmRecords || []).forEach((farmRecord) => species.add(normalizeSpecies(farmRecord.species)));

    const personalizedTips = Array.from(species)
      .flatMap((speciesName) => SPECIES_TIPS[speciesName] || [])
      .filter(Boolean);
    if (petsError || farmRecordsError) {
      outcome.profileDataWarning = petsError?.message || farmRecordsError?.message;
      console.error('Failed to load profile animal data for scheduled tip:', petsError || farmRecordsError);
    }
    if (personalizedTips.length === 0) {
      outcome.skipped = true;
      outcome.reason = 'No recognized pet or farm species';
      deliveryResults.push(outcome);
      continue;
    }

    const tip = chooseRandomTip(personalizedTips);
    const title = 'MVS Pet Care Tip 🐾';
    const { data: storedNotification, error: notificationError } = await supabase.from('notifications').insert({
      user_id: profile.id,
      title,
      body: tip,
      read_status: false,
    }).select('id').single();
    if (notificationError) {
      outcome.notificationError = notificationError.message;
      console.error('Failed to persist scheduled tip notification:', notificationError);
    }

    try {
      if (profile.expo_push_token) {
        const expoResult = await sendExpoNotification(profile.expo_push_token, title, tip, storedNotification?.id);
        outcome.expo = expoResult;
      }

      if (profile.web_push_subscription) {
        await sendWebNotification(profile.web_push_subscription, title, tip, storedNotification?.id);
        outcome.web = { sent: true };
      }
    } catch (error) {
      outcome.error = error instanceof Error ? error.message : String(error);
    }

    deliveryResults.push(outcome);
  }

  return new Response(JSON.stringify({ sent: recipients.length, results: deliveryResults }), { status: 200 });
});
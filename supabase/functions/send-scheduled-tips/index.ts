// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webPush from 'https://esm.sh/web-push@3.0.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const VAPID_PUBLIC_KEY = Deno.env.get('EXPO_PUBLIC_VAPID_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

const MONDAY_TIPS = [
  "Fresh week, happy tails! Make sure your pet's water bowl is clean and full today. 🐾",
  "A tired dog is a happy dog! Start the week with a 15-minute morning walk. 🐕",
  "Monday check: Inspect your pet’s food bowl for cracks or bacteria build-up. 🧼",
  "Start the week right: Spend 5 minutes brushing your pet’s coat today. 🐈",
  "Hydration check! Ensure your pet has fresh, cool water accessible all day. 💧",
  "Dogs love routines! Set consistent feeding times for the week ahead. ⏰",
  "Check your pet's paws after morning walks for dirt or small pebbles. 🐾",
  "Bright eyes, happy pet! Wipe away any morning eye discharge gently with a damp cloth. ✨",
  "Give your pet a quick mental workout: Hide treats around the living room today! 🧠",
  "Is your pet’s collar snug but comfortable? Perform the two-finger fit check today. 🏷️",
  "Monday motivation: A quick game of fetch sets a positive tone for the week! 🎾",
  "Keep pet food stored in an airtight container to preserve freshness and nutrient value. 🔒",
  "Inspect your pet’s ears today for any redness, odor, or excess wax build-up. 👂",
  "Cats love high places! Ensure your feline friend has a safe elevated perching spot. 🐱",
  "Keep your pet’s bedding clean by giving it a quick wash this week. 🧺",
  "Did you know? Regular playtime reduces anxiety and destructive behavior in pets. 🎾",
  "Take a quick photo of your pet today! It's great to track their growth and health over time. 📸",
  "Small daily walks build strong hearts. Keep your buddy moving! 💓",
  "Ensure trash cans are securely covered so curious paws don't dig in. 🗑️",
  "Check your pet’s nails today—if they click loudly on the floor, it’s time for a trim! ✂️",
  "Pet dental health matters! Introduce pet-friendly toothpaste or dental chews. 🪥",
  "Make sure your pet’s identification tags are clear and legible. 🏷️",
  "A quick gentle massage can calm an anxious dog or cat at the start of the week. 💆‍♂️",
  "Prevent flea infestations: Double-check your pet’s coat after outdoor activity. 🪲",
  "Remember: Chocolate, onions, and grapes are toxic to dogs and cats! 🚫",
  "Keep indoor environments well-ventilated for optimal pet respiratory health. 💨",
  "Cats are natural hunters! Use a feather wand to engage their hunting instincts today. 🪶",
  "Is your dog eating too fast? Try using a slow-feeder bowl today. 🥣",
  "Ensure heavy furniture and televisions are secured so climbing pets stay safe. 🏠",
  "Praise good behavior! Positive reinforcement builds a stronger bond with your pet. 🏅",
  "Check indoor plants—ensure they are non-toxic to your curious pets. 🪴",
  "Keep electrical cords tucked away and safe from chewing puppies and kittens. 🔌",
  "Show some love! Spend 10 uninterrupted minutes cuddling your pet today. ❤️",
  "Keep household cleaning chemicals locked away safely out of pet reach. 🔐",
  "A clean litter box makes a happy cat. Scoop at least once daily! 🐈‍⬛"
];

const WEDNESDAY_TIPS = [
  "Mid-week pet check! Take 30 seconds to inspect your pet’s ears and coat. 🐱",
  "Dogs really are man's best friend. Have you given yours a treat today? 🦴",
  "Hump day exercise! A brisk 20-minute walk keeps obesity at bay. 🏃‍♂️",
  "Check your pet’s weight! Maintaining a lean body weight adds years to their life. ⚖️",
  "Cats hide pain well. Watch out for subtle changes in appetite or mood today. 🩺",
  "Rotate your pet's toys today! Bringing out an old toy feels brand new to them. 🧸",
  "Keep small household items like hair ties and coins out of your pet's reach. 🚫",
  "Check your dog's elbows and joints for any stiffness when standing up. 🦵",
  "Did you know? Purring in cats can mean contentment, but also self-soothing. 🐈",
  "Ensure your pet has a cozy, quiet resting space away from foot traffic. 🛌",
  "Mid-week grooming: A quick coat brushing removes loose hair and dander. 🧹",
  "Prevent ear infections: Keep your pet's ears dry after baths or swimming. 🏊",
  "Keep human medications strictly out of reach of all pets! 💊",
  "Reward your pet for staying calm during doorbells or visitors. 🚪",
  "Is your dog panting excessively? Ensure adequate shade and water immediately. ☀️",
  "Check your pet's gums! Healthy gums should look pink, not pale or bright red. 👄",
  "Introduce a puzzle toy today to keep your pet mentally stimulated while you work. 🧩",
  "Never leave pets unattended inside parked vehicles, even for a few minutes. 🚗",
  "Regular exercise keeps your pet’s digestion smooth and healthy. 🐕‍🦺",
  "Keep food and water bowls clean to prevent bacterial growth. 🧼",
  "Cats need scratching posts to keep claws healthy and stretch their spine. 🐾",
  "Are your pet's shots current? Open MVS to review their record! 💉",
  "A quick 5-minute training session keeps your dog’s mind sharp and responsive. 🎓",
  "Provide cool ceramic or tiled surfaces for your pet to rest on warm days. 🧊",
  "Avoid feeding table scraps—high fat foods can trigger pancreatitis in pets. 🥩",
  "Inspect your yard or balcony to ensure fences and railings are secure. 🏡",
  "Give your cat fresh water daily—cats often prefer running or fresh water! ⛲",
  "Keep toxic items like Xylitol (sugar-free sweetener) away from dogs. 🍬",
  "Brush up on basic commands: 'Sit', 'Stay', and 'Come' save lives! 📢",
  "Gentle handling of your pet's paws makes future nail trims much easier. 🐾",
  "Monitor your pet’s daily water consumption—sudden spikes can indicate illness. 🥛",
  "Playtime isn't just fun—it lowers stress levels for both you and your pet! 🥏",
  "Check for ticks or fleas after any walk through tall grass or bushes. 🌾",
  "Make sure your pet has a clear, undisturbed place to sleep at night. 🌙",
  "Show appreciation: Extra belly rubs today for being the best companion! ✨"
];

const FRIDAY_TIPS = [
  "Weekend ahead! Plan a fun outdoor play session with your buddy. 🎾",
  "Preventive care is true love. Is your pet's vaccination schedule up to date? 🛡️",
  "Friday fun: Try teaching your pet a brand new trick before the weekend! 🎩",
  "Planning a weekend road trip? Secure your pet with a harness or crate. 🚘",
  "Weekend hazard check: Ensure barbecue tools and hot grills are out of reach. 🍖",
  "Grooming Friday! Give your pet a thorough brush down to reduce shedding. 🧼",
  "Inspect your pet's leash and collar for wear, tears, or loose buckles. 🦮",
  "Have a emergency vet contact saved on your phone? Check MVS contacts today! 📞",
  "Set aside dedicated outdoor time this Saturday for your dog's favorite game. 🌾",
  "Check your pet’s coat for any bumps, lumps, or unusual skin spots today. 🔍",
  "Weekend treats: Freeze some pet-safe broth into ice cubes for a fun treat! 🧊",
  "Ensure your pet has a comfortable, quiet retreat if hosting weekend guests. 🏠",
  "Inspect pet toys for torn squeakers or small swallowable pieces—discard broken ones! 🧸",
  "A clean pet bed makes weekend lounging even better. Give it a quick wash! 🧺",
  "Got a senior pet? Ensure their sleeping pad provides good orthopedic support. 🛏️",
  "Keep your pet on their regular diet over the weekend to prevent stomach upsets. 🍲",
  "Planning outdoor activity? Avoid hot asphalt during peak sunshine hours. 🛣️",
  "Check your pet's eyes for clarity—clear eyes reflect good overall health. 👀",
  "Cats love cardboard boxes! Leave a clean box out for some weekend exploration. 📦",
  "Ensure outdoor water bowls are weighed down so they don't tip over. 🚰",
  "Spend quality one-on-one time with each of your pets this weekend. 💗",
  "If visiting a new park this weekend, keep your dog leashed until you verify safety. 🌳",
  "Keep chocolate, alcoholic beverages, and party food safely away from pets. 🍸",
  "Double check that your pet's microchip details are up to date on MVS. 🏷️",
  "Reward your pet with an extra belly rub for being your faithful partner all week! 🐾",
  "Does your pet need a bath? Friday afternoon is a great time to freshen up! 🛁",
  "Check water bowls twice on hot weekend days to guarantee hydration. 💧",
  "Keep indoor lighting comfortable for your pet if leaving them home briefly. 💡",
  "Cats appreciate predictable routines—try to keep weekend feeding on schedule! ⏱️",
  "Make sure your pet’s favorite treats are stocked up for the weekend. 🦴",
  "Take a relaxing walk together at dusk—great exercise and bonding! 🌅",
  "Always carry extra waste bags during your weekend park visits. 🧻",
  "Create an obstacle course at home using pillows for indoor agility fun! 🏰",
  "Friday reminder: Love, care, and quality food equal a long, happy pet life. 💚",
  "Consult a licensed vet on MVS instantly if you notice any health changes! 🩺"
];

const sendExpoNotification = async (token: string, title: string, body: string) => {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title,
      body,
      data: { url: '/' },
    }),
  });

  return response.json();
};

const sendWebNotification = async (subscriptionString: string, title: string, body: string) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('Web push VAPID keys are not configured for this Edge Function.');
  }

  const parsedSubscription = JSON.parse(subscriptionString);
  webPush.setVapidDetails('mailto:admin@mvsapp.com.ng', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  await webPush.sendNotification(parsedSubscription, JSON.stringify({
    title,
    body,
    data: { url: '/' },
  }));
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const day = new Date().getDay();
  let pool = MONDAY_TIPS;
  if (day === 3) pool = WEDNESDAY_TIPS;
  if (day === 5) pool = FRIDAY_TIPS;

  const tip = pool[Math.floor(Math.random() * pool.length)];

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, expo_push_token, web_push_subscription');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const recipients = (profiles || []).filter((profile) => profile.expo_push_token || profile.web_push_subscription);

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ message: 'No tokens found' }), { status: 200 });
  }

  const deliveryResults = [];

  for (const profile of recipients) {
    const outcome: Record<string, unknown> = { userId: profile.id };
    try {
      if (profile.expo_push_token) {
        const expoResult = await sendExpoNotification(profile.expo_push_token, 'MVS Pet Care Tip 🐾', tip);
        outcome.expo = expoResult;
      }

      if (profile.web_push_subscription) {
        await sendWebNotification(profile.web_push_subscription, 'MVS Pet Care Tip 🐾', tip);
        outcome.web = { sent: true };
      }
    } catch (error) {
      outcome.error = error instanceof Error ? error.message : String(error);
    }

    deliveryResults.push(outcome);
  }

  return new Response(JSON.stringify({ sent: recipients.length, results: deliveryResults }), { status: 200 });
});
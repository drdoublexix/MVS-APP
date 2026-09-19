const sharp = require('sharp');

const bgColor = { r: 8, g: 17, b: 31, alpha: 1 };

async function buildIcon(size) {
  const fg = sharp('assets/images/android-icon-foreground.png')
    .resize(size, size, { fit: 'contain', background: bgColor, withoutEnlargement: false });

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: await fg.toBuffer(), gravity: 'centre' }])
    .png()
    .toFile(`public/icon-${size}.png`);
}

async function main() {
  await buildIcon(512);
  await buildIcon(192);

  const fg = sharp('assets/images/android-icon-foreground.png')
    .resize(512, 512, { fit: 'contain', background: bgColor, withoutEnlargement: false });

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: await fg.toBuffer(), gravity: 'centre' }])
    .png()
    .toFile('public/icon-maskable-512.png');

  const meta512 = await sharp('public/icon-512.png').metadata();
  const meta192 = await sharp('public/icon-192.png').metadata();

  console.log('icon-512', meta512.width, meta512.height, 'alpha=', meta512.hasAlpha);
  console.log('icon-192', meta192.width, meta192.height, 'alpha=', meta192.hasAlpha);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

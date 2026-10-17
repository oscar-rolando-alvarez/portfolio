<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup>
// Initialize app
useHead({
  titleTemplate: '%s - SocialConnect',
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'format-detection', content: 'telephone=no' }
  ],
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
  ]
})

// SEO and PWA meta
useSeoMeta({
  title: 'SocialConnect - Connect with friends and share moments',
  ogTitle: 'SocialConnect - Connect with friends and share moments',
  description: 'A modern social media platform for connecting with friends, sharing stories, and discovering amazing content.',
  ogDescription: 'A modern social media platform for connecting with friends, sharing stories, and discovering amazing content.',
  ogImage: '/og-image.png',
  twitterCard: 'summary_large_image'
})
</script>
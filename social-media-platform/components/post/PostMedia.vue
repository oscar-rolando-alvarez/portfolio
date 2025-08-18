<template>
  <div class="media-container">
    <!-- Single image -->
    <div v-if="images.length === 1 && videos.length === 0" class="single-media">
      <img
        :src="images[0]"
        :alt="'Post image'"
        class="w-full max-h-96 object-cover rounded-lg cursor-pointer"
        @click="openLightbox(images[0], 'image')"
      />
    </div>

    <!-- Multiple images grid -->
    <div v-else-if="images.length > 1" class="grid gap-2" :class="getGridClass(images.length)">
      <div
        v-for="(image, index) in images.slice(0, 4)"
        :key="index"
        class="relative overflow-hidden rounded-lg cursor-pointer"
        :class="getImageClass(index, images.length)"
        @click="openLightbox(image, 'image', index)"
      >
        <img
          :src="image"
          :alt="`Post image ${index + 1}`"
          class="w-full h-full object-cover"
        />
        
        <!-- Show "+X more" overlay for excess images -->
        <div
          v-if="index === 3 && images.length > 4"
          class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"
        >
          <span class="text-white font-semibold text-lg">
            +{{ images.length - 4 }} more
          </span>
        </div>
      </div>
    </div>

    <!-- Video -->
    <div v-if="videos.length > 0" class="video-container mt-2">
      <video
        v-for="(video, index) in videos"
        :key="index"
        :src="video"
        class="w-full max-h-96 rounded-lg"
        controls
        preload="metadata"
      >
        Your browser does not support the video tag.
      </video>
    </div>

    <!-- Lightbox -->
    <MediaLightbox
      v-if="lightboxOpen"
      :media="lightboxMedia"
      :type="lightboxType"
      :index="lightboxIndex"
      :total="images.length"
      @close="closeLightbox"
      @previous="previousMedia"
      @next="nextMedia"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  images: {
    type: Array,
    default: () => []
  },
  videos: {
    type: Array,
    default: () => []
  }
})

const lightboxOpen = ref(false)
const lightboxMedia = ref('')
const lightboxType = ref('image')
const lightboxIndex = ref(0)

const getGridClass = (count) => {
  if (count === 2) return 'grid-cols-2'
  if (count === 3) return 'grid-cols-2'
  if (count >= 4) return 'grid-cols-2'
  return 'grid-cols-1'
}

const getImageClass = (index, total) => {
  const baseClass = 'aspect-square'
  
  if (total === 2) return baseClass
  if (total === 3) {
    return index === 0 ? 'row-span-2 aspect-auto' : baseClass
  }
  if (total >= 4) return baseClass
  
  return baseClass
}

const openLightbox = (media, type, index = 0) => {
  lightboxMedia.value = media
  lightboxType.value = type
  lightboxIndex.value = index
  lightboxOpen.value = true
}

const closeLightbox = () => {
  lightboxOpen.value = false
}

const previousMedia = () => {
  if (lightboxIndex.value > 0) {
    lightboxIndex.value--
    lightboxMedia.value = props.images[lightboxIndex.value]
  }
}

const nextMedia = () => {
  if (lightboxIndex.value < props.images.length - 1) {
    lightboxIndex.value++
    lightboxMedia.value = props.images[lightboxIndex.value]
  }
}
</script>
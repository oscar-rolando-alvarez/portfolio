<template>
  <header class="bg-white border-b border-gray-200 px-4 py-3 safe-top">
    <div class="flex items-center justify-between">
      <!-- Menu button -->
      <button
        @click="$emit('toggle-sidebar')"
        class="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
      >
        <Bars3Icon class="w-6 h-6" />
      </button>

      <!-- Logo -->
      <NuxtLink to="/" class="flex items-center space-x-2">
        <div class="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
          <span class="text-white font-bold text-xs">SC</span>
        </div>
        <span class="text-lg font-bold text-gray-900">SocialConnect</span>
      </NuxtLink>

      <!-- Actions -->
      <div class="flex items-center space-x-2">
        <!-- Search button -->
        <button
          @click="showSearch = true"
          class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
        >
          <MagnifyingGlassIcon class="w-5 h-5" />
        </button>

        <!-- New post button -->
        <button
          @click="showPostModal = true"
          class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
        >
          <PlusIcon class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Search modal -->
    <SearchModal v-model="showSearch" />

    <!-- Post modal -->
    <PostModal v-model="showPostModal" />
  </header>
</template>

<script setup>
import { ref } from 'vue'
import {
  Bars3Icon,
  MagnifyingGlassIcon,
  PlusIcon
} from '@heroicons/vue/24/outline'

const emit = defineEmits(['toggle-sidebar'])

const showSearch = ref(false)
const showPostModal = ref(false)
</script>
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none">
    <!-- Back person -->
    <circle cx="12.25" cy="5" r="2.5" :fill="lightColor" />
    <path
      :fill="lightColor"
      d="M17.5 14.25c0-2.209-2.35-4-5.25-4-.72 0-1.4.11-2.01.31 1.34.9 2.26 2.3 2.26 3.94V15.5h5v-1.25z"
    />
    <!-- Front person -->
    <circle cx="6.5" cy="5.5" r="2.75" :fill="darkColor" />
    <path
      :fill="darkColor"
      d="M12.5 14.75C12.5 12.13 9.81 10 6.5 10S.5 12.13.5 14.75V16h12v-1.25z"
    />
  </svg>
</template>
<script>
import Base from '../base.vue';
export default {
  name: 'IconPeople',
  extends: Base,
};
</script>

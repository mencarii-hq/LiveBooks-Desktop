<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
    <g fill="none" fill-rule="evenodd">
      <path
        :fill="lightColor"
        d="M5.2 14.5C3 14.5 1.2 12.7 1.2 10.5c0-1.7 1.1-3.2 2.6-3.7C4 4.8 5.7 3.4 7.8 3.4c1.7 0 3.2.9 4.1 2.2 2.2.2 3.9 2 3.9 4.2 0 2.3-1.9 4.2-4.2 4.2H5.2z"
      />
      <path
        :fill="darkColor"
        fill-rule="nonzero"
        d="M11.6 15.2H5.2C2.6 15.2.5 13.1.5 10.5c0-2 .1-3.8 2.4-4.6C3.2 4.1 5.3 2.7 7.8 2.7c1.8 0 3.4.8 4.5 2.1 2.6.3 4.6 2.5 4.6 5.1 0 2.8-2.3 5.3-5.3 5.3zm0-1.6c1.9 0 3.5-1.6 3.5-3.5 0-1.8-1.4-3.3-3.2-3.5l-.5-.1-.2-.4C10.6 5.1 9.3 4.3 7.8 4.3c-1.7 0-3.2.9-3.8 2.4l-.2.4-.5.1C2.3 7.6 2.1 9 2.1 10.5c0 1.7 1.4 3.1 3.1 3.1h6.4z"
      />
    </g>
  </svg>
</template>
<script>
import Base from '../base.vue';
export default {
  name: 'IconCloud',
  extends: Base,
};
</script>

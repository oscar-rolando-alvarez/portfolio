import type { StorybookConfig } from '@storybook/nextjs';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-viewport',
    '@storybook/addon-controls',
    '@storybook/addon-actions',
  ],
  
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },
  
  features: {
    experimentalRSC: true,
  },
  
  docs: {
    autodocs: 'tag',
  },
  
  staticDirs: ['../public'],
  
  webpackFinal: async (config) => {
    // Handle CSS imports
    config.module?.rules?.push({
      test: /\.css$/,
      use: [
        {
          loader: 'postcss-loader',
          options: {
            postcssOptions: {
              plugins: [
                require('tailwindcss'),
                require('autoprefixer'),
              ],
            },
          },
        },
      ],
    });

    return config;
  },
};

export default config;
module.exports = {
  apps: [
    {
      name: "selrs-local",
      script: "dist/index.js",
      cwd: __dirname,
      // dist/index.js imports "dotenv/config", so .env in cwd will be loaded at runtime.
      env: {
        NODE_ENV: "production",
        HOST: process.env.HOST || "0.0.0.0",
        PORT: process.env.PORT || "5000",
      },
      time: true,
      max_memory_restart: "750M",
    },
  ],
};


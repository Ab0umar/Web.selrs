module.exports = {
  apps: [
    {
      name: "API",
      cwd: "E:\\SELRS\\api-server-python",
      script: "C:\\Python314\\python.exe",
      args: "SFC.py",
      interpreter: "none",
      env: {
        PORT: "3000"
      }
    },
    {
      name: "SELRS.cc",
      cwd: "E:\\SELRS.cc\\MySQL",
      script: "cmd.exe",
      args: "/c pnpm start",
      interpreter: "none",
      env: {
        PORT: "4000"
      }
    },
    {
      name: "CF-TUNNEL",
      script: "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
      args: "tunnel run selrs-fresh",
      interpreter: "none"
    }
  ]
};

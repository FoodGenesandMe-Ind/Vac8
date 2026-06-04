#!/usr/bin/env sh
# Stop stale Vac8 dev processes (API + Vite ports)
for port in 3847 5173 5174 5175 5176; do
  pids=$(lsof -ti :"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Stopping port $port (pid $pids)"
    kill $pids 2>/dev/null || true
  fi
done
sleep 1
echo "Done."

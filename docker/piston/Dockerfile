# Piston image with automatic language package installation on first start.
#
# Build:
#   docker build -t digimine-piston .
# Run:
#   docker run -d --privileged -p 2000:2000 -v piston-data:/piston digimine-piston

FROM ghcr.io/engineer-man/piston:latest

USER root

# Fix Debian Buster EOL apt repositories (moved to archive)
RUN sed -i 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' /etc/apt/sources.list && \
    sed -i 's|http://security.debian.org/debian-security|http://archive.debian.org/debian-security|g' /etc/apt/sources.list && \
    echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check-valid-until && \
    apt-get update -o Acquire::AllowInsecureRepositories=true && \
    apt-get install -y --no-install-recommends --allow-unauthenticated curl && \
    rm -rf /var/lib/apt/lists/*

# Copy the install script
COPY install-packages.sh /install-packages.sh
RUN chmod +x /install-packages.sh

# Fix Piston entrypoint: it uses 'mkdir isolate' which fails if the dir exists
# (leftover from previous runs or baked into the base image)
RUN sed -i 's/mkdir isolate/mkdir -p isolate/g' /piston_api/src/docker-entrypoint.sh && \
    rm -rf /piston_api/src/isolate /isolate 2>/dev/null || true

# Create startup wrapper that installs packages on first container start
RUN cat > /start-piston.sh << 'EOF'
#!/bin/sh
# NOTE: Do NOT use 'set -e' here — install script failures must not kill Piston

# Clean up stale isolate cgroups from previous crashed containers
# (required because --cgroupns=host shares the host cgroup namespace)
if [ -d /sys/fs/cgroup/isolate/init ]; then
    while read -r pid; do
        [ -n "$pid" ] && echo "$pid" > /sys/fs/cgroup/cgroup.procs 2>/dev/null || true
    done < /sys/fs/cgroup/isolate/init/cgroup.procs
    rmdir /sys/fs/cgroup/isolate/init 2>/dev/null || true
fi
if [ -d /sys/fs/cgroup/isolate ]; then
    while read -r pid; do
        [ -n "$pid" ] && echo "$pid" > /sys/fs/cgroup/cgroup.procs 2>/dev/null || true
    done < /sys/fs/cgroup/isolate/cgroup.procs
    rmdir /sys/fs/cgroup/isolate 2>/dev/null || true
fi

# Older images wrote this marker inside /piston/packages, but Piston scans
# that directory as package directories. Remove it before the API loads.
rm -f /piston/packages/.installed 2>/dev/null || true
mkdir -p /piston/packages 2>/dev/null || true
INSTALL_MARKER="/piston/.packages-installed"

# Piston's bundled entrypoint hard-codes PID 1 while preparing cgroup v2.
# This wrapper is PID 1, so initialize cgroups here before starting Node.
CGROUP_FS="/sys/fs/cgroup"
if [ ! -e "$CGROUP_FS" ]; then
    echo "Cannot find $CGROUP_FS. Please make sure your system is using cgroup v2"
    exit 1
fi
if [ -e "$CGROUP_FS/unified" ]; then
    echo "Combined cgroup v1+v2 mode is not supported. Please use pure cgroup v2"
    exit 1
fi
if [ ! -e "$CGROUP_FS/cgroup.subtree_control" ]; then
    echo "Cgroup v2 not found. Please make sure cgroup v2 is enabled on your system"
    exit 1
fi

cd /sys/fs/cgroup || exit 1
mkdir -p isolate
echo 1 > isolate/cgroup.procs
echo '+cpuset +cpu +io +memory +pids' > cgroup.subtree_control
cd isolate || exit 1
mkdir -p init
echo 1 > init/cgroup.procs
echo '+cpuset +memory' > cgroup.subtree_control
echo "Initialized cgroup"

chown -R piston:piston /piston
su -- piston -c 'ulimit -n 65536 && node /piston_api/src' &
PID=$!

# Wait for API to be ready
echo "Waiting for Piston API to start..."
for i in $(seq 1 60); do
    if curl -sf http://localhost:2000/api/v2/runtimes > /dev/null 2>&1; then
        echo "Piston API is ready."
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "Piston API did not start in time."
        kill $PID || true
        exit 1
    fi
    sleep 2
done

# Verify packages on every start; the installer is idempotent and skips
# already-installed runtimes, while still repairing failed prior attempts.
if [ -f "$INSTALL_MARKER" ]; then
    echo "Verifying language packages..."
else
    echo "Installing language packages (first start)..."
fi

/install-packages.sh
INSTALL_STATUS=$?
touch "$INSTALL_MARKER"
if [ $INSTALL_STATUS -eq 0 ]; then
    echo "All packages installed successfully."
else
    echo "Some packages failed, but Piston will keep running."
fi

# Keep container alive by waiting for the API process
wait $PID
EOF
RUN chmod +x /start-piston.sh

EXPOSE 2000

CMD ["/start-piston.sh"]


NODE_ID=$1
NODE_NAME="${CLUSTER_NAME}-$NODE_ID"
NODE_BASE="$CLUSTER_BASE/nodes/$NODE_ID"
ROOTFS_BASE="$CLUSTER_BASE/fs"
ROOTFS_LOCK="$CLUSTER_BASE/fs/lock"

shift

node_status() {
    lxc-info -n $NODE_NAME 2>/dev/null | grep 'state:' | sed -r 's/^state:\s*(\S+).*$/\1/'
}

node_provision() {
    local dir nic br
    for dir in root over ; do
        mkdir -p $NODE_BASE/$dir
    done

    echo >$NODE_BASE/config

    nic=0
    for br in $NICS ; do
        cat >>$NODE_BASE/config <<EOF
lxc.network.type=veth
lxc.network.link=$br
lxc.network.flags=up
lxc.network.hwaddr = 00:16:3e:75:$(printf "%02x" $NODE_ID):$(printf "%02x" $nic)
EOF
        nic=$((nic+1))
    done

    cat >>$NODE_BASE/config <<EOF
lxc.utsname = $NODE_NAME
lxc.rootfs = $NODE_BASE/root
EOF

    [ -f "$LXC_CONFIG" ] || LXC_CONFIG="$SCRIPTBASE/lxc-default.conf"
    cat "$LXC_CONFIG" >>$NODE_BASE/config
}

node_start() {
    lxc-start -n $NODE_NAME -f $NODE_BASE/config -o $NODE_BASE/lxc.log -l INFO -d $INIT

    # lxc-wait doesn't support timeout, can't be used here
    local tries=0
    while [ $tries -lt 600 ]; do
        test "$(node_status)" == "RUNNING" && return 0
        tries=$((tries+1))
        sleep 0.1
    done
    return 1
}

node_stop() {
    case "$(node_status)" in
        RUNNING|STARTING|FREEZING|FROZEN)
            lxc-stop -n $NODE_NAME
            ;;
    esac
}

fs_lock() {
    mkdir -p "$ROOTFS_BASE" || true
    local locker
    while true; do
        echo $$ >>"$ROOTFS_LOCK"
        locker=$(head -1 "$ROOTFS_LOCK")
        [ -n "$locker" ] && [ -d "/proc/$locker" ] && break
        rm -f "$ROOTFS_LOCK"
    done
    echo $locker
}

fs_unlock() {
    rm -f "$ROOTFS_LOCK"
}

fs_inuse() {
    local mounts
    for dir in $(find "$CLUSTER_BASE/nodes" -mindepth 1 -maxdepth 1 -type d); do
        mountpoint "$dir" && mounts=yes && break
    done
    test -n "$mounts"
}

mount_fs() {
    local locker=$(fs_lock) n var fsdir lower
    if [ "$locker" == "$$" ]; then
        if ! fs_inuse ; then
            rm -f "$ROOTFS_BASE/root"
            for ((n=0;n<10;n=n+1)); do
                var=ROOTFS$n
                fsdir="${!var}"
                if [ -f "$fsdir" ]; then
                    mkdir -p "$ROOTFS_BASE/m$n"
                    mountpoint "$ROOTFS_BASE/m$n" || mount -t squashfs "$fsdir" "$ROOTFS_BASE/m$n"
                    fsdir="$ROOTFS_BASE/m$n"
                fi
                if [ -d "$fsdir" ]; then
                    if [ -n "$lower" ]; then
                        mkdir -p "$ROOTFS_BASE/$n"
                        mountpoint "$ROOTFS_BASE/$n" || mount -t overlayfs -o ro,upperdir=$fsdir,lowerdir=$lower overlay "$ROOTFS_BASE/$n"
                        lower="$ROOTFS_BASE/$n"
                    else
                        lower="$fsdir"
                    fi
                else
                    break
                fi
            done
            echo -n $(basename "$lower") >"$ROOTFS_BASE/root"
        fi
        fs_unlock
    fi

    for ((n=0;n<100;n=n+1)); do
        lower=$(cat "$ROOTFS_BASE/root")
        [ -n "$lower" ] && break
        sleep 0.1
    done
    if [ -z "$lower" ]; then
        echo "No ROOTFS found" 1>&2
        exit 1
    fi
    mountpoint $NODE_BASE/root || mount -t overlayfs -o rw,upperdir=$NODE_BASE/over,lowerdir=$ROOTFS_BASE/$lower overlay $NODE_BASE/root
}

umount_fs() {
    ! mountpoint $NODE_BASE/root || umount $NODE_BASE/root
    local locker=$(fs_lock)
    if [ "$locker" == "$$" ]; then
        if ! fs_inuse; then
            for dir in $(find "$ROOTFS_BASE" -mindepth 1 -maxdepth 1 -type d); do
                if mountpoint "$dir" ; then
                    umount "$dir"
                    rmdir "$dir"
                fi
            done
            rm -f "$ROOTFS_BASE/root"
        fi
        fs_unlock
    fi
}

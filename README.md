# Development Cluster Management

## Usage

```bash
npm install evo-garage -g
```

Create a containing folder for your cluster, e.g. `$HOME/myCluster`. 
Create a simple YAML file `$HOME/myCluster/cluster.yml` with

```yaml
---
script: lxc
env:
    ROOTFS: full-path-to-your-rootfs.squashfs
```

You can use [stemcell](https://github.com/evo-cloud/stemcell) to build a rootfs.

Now start server (remeber to use sudo as lxc requires root privilege):

```bash
sudo garage-server --clusters=$HOME/myCluster
```

Use the following command to list all clusters:

```bash
garage-cli clusters
```

Or you can add a new cluster on the fly:

```bash
garage-cli add-cluster path-to-dir-which-contains-cluster.yml
```

Let's get excited now!

```bash
garage-cli start myCluster 1-16
```

It will create and start 16 nodes with IDs from 1 to 16.
You can also create nodes with any IDs you like:

```bash
garage-cli start myCluster 20 25 46-50
```

Use `lxc-console` to attach to a node:

```bash
sudo lxc-console -n "myCluster-20" -t 1
```

You can check the nodes status:

```bash
garage-cli nodes myCluster
```

You can stop any nodes in the cluster as simple as `start`

```bash
garage-cli stop myCluster 1 5 7 9 10-20
```

## Supported Containers

It only supports Linux Container at present, 
but it is very easy to add other containers like QEMU, 
VirtualBox etc if you can build rootfs in virtual disk files.
There are only 4 script files you need to add:

- nodes  it prints created node IDs one per line
- status it accepts one parameter as node ID and displays node status as one `key:value` pair per line
- start  it accepts one parameter as node ID for starting the node
- stop   it accepts one parameter as node ID for stopping the node

## License

MIT

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <queue>
#include <stdexcept>
#include <vector>
#include <array>
#include <map>
#include <numeric>
#include <tuple>
using std::vector;
using u32=uint32_t;
struct Point {int32_t x,y;};
struct Stop {Point p;int32_t u,v;Point q;int32_t status;};
struct Arc {u32 v;double length;};
struct State {double f,g;u32 u;bool operator<(const State& o)const{return f>o.f;}};
struct Groups {
    vector<u32> roots;
    explicit Groups(size_t count):roots(count){std::iota(roots.begin(),roots.end(),0);}
    u32 find(u32 n){while(roots[n]!=n){roots[n]=roots[roots[n]];n=roots[n];}return n;}
    bool join(u32 a,u32 b){a=find(a);b=find(b);if(a==b)return false;roots[b]=a;return true;}
};
template<class T> void read(std::istream& in,T* out,size_t n=1){
    if(n && !in.read(reinterpret_cast<char*>(out),n*sizeof(T)))throw std::runtime_error("truncated input");
}
template<class T> void write(std::ostream& out,T value){out.write(reinterpret_cast<char*>(&value),sizeof(T));}
int main(int argc,char**argv) try {
    if(argc!=4)throw std::runtime_error("graph requests results");
    std::ifstream graph(argv[1],std::ios::binary),req(argv[2],std::ios::binary);
    std::ofstream out(argv[3],std::ios::binary);
    char magic[4];read(graph,magic,4);if(std::string(magic,4)!="FYR2")throw std::runtime_error("graph version");
    u32 n,m;read(graph,&n);read(graph,&m);vector<Point> points(n);read(graph,points.data(),n);
    vector<std::array<u32,2>> edges(m);read(graph,edges.data(),m);vector<uint8_t> preferred(m);read(graph,preferred.data(),m);
    double kx,ky;read(req,&kx);read(req,&ky);kx/=1e7;ky/=1e7;
    auto dist=[&](Point a,Point b){return std::hypot((double(a.x)-b.x)*kx,(double(a.y)-b.y)*ky);};
    vector<u32> off(n+1);
    for(auto e:edges){++off[e[0]+1];++off[e[1]+1];}
    for(u32 i=0;i<n;i++)off[i+1]+=off[i];
    auto cursor=off;vector<Arc> arcs(off.back());
    for(u32 j=0;j<m;j++){auto a=edges[j][0],b=edges[j][1];double len=dist(points[a],points[b])*(preferred[j]?1.:1.18);
        arcs[cursor[a]++]={b,len};arcs[cursor[b]++]={a,len};}
    vector<int> component(n,-1);vector<u32> stack;
    for(u32 r=0;r<n;r++)if(component[r]<0){component[r]=r;stack.push_back(r);
        while(!stack.empty()){auto v=stack.back();stack.pop_back();
            for(auto j=off[v];j<off[v+1];j++){auto u=arcs[j].v;if(component[u]<0){component[u]=r;stack.push_back(u);}}}}
    u32 ns,np;read(req,&ns);read(req,&np);vector<Stop> stops(ns);read(req,stops.data(),ns);
    vector<uint8_t> tiers(ns);read(req,tiers.data(),ns);
    vector<std::array<u32,2>> pairs(np);read(req,pairs.data(),np);
    // Locate every terminal on its edge. Consecutive projections share the same
    // roadway even when several terminals lie between the original OSM nodes.
    const u32 all=n+2*ns;
    vector<vector<Arc>> extra(all);
    auto connect=[&](u32 u,u32 v,double d){extra[u].push_back({v,d});extra[v].push_back({u,d});};
    std::map<std::array<int32_t,2>,vector<u32>> onEdge;
    for(u32 j=0;j<ns;j++)if(!stops[j].status)onEdge[{stops[j].u,stops[j].v}].push_back(j);
    for(auto& entry:onEdge){
        u32 u=entry.first[0],v=entry.first[1];double factor=1;
        for(auto k=off[u];k<off[u+1];k++)if(arcs[k].v==v){
            double len=dist(points[u],points[v]);if(len)factor=arcs[k].length/len;break;}
        auto& seq=entry.second;
        std::sort(seq.begin(),seq.end(),[&](u32 a,u32 b){
            return dist(points[u],stops[a].q)<dist(points[u],stops[b].q);});
        u32 previous=u;Point p=points[u];
        for(u32 j:seq){connect(previous,n+j,factor*dist(p,stops[j].q));connect(n+j,n+ns+j,dist(stops[j].q,stops[j].p));previous=n+j;p=stops[j].q;}
        connect(previous,v,factor*dist(p,points[v]));
    }
    for(uint8_t tier=0;tier<4;tier++){
        vector<int> owner(all,-1);vector<double> d(all,std::numeric_limits<double>::infinity());
        std::priority_queue<State> heap;
        for(u32 j=0;j<ns;j++)if(tiers[j]==tier&&!stops[j].status){
            u32 leaf=n+ns+j;d[leaf]=0;owner[leaf]=j;heap.push({0,0,leaf});}
        while(!heap.empty()){
            auto s=heap.top();heap.pop();if(s.g!=d[s.u])continue;
            auto visit=[&](Arc a){double g=s.g+a.length;if(g<d[a.v]){d[a.v]=g;owner[a.v]=owner[s.u];heap.push({g,g,a.v});}};
            if(s.u<n)for(auto j=off[s.u];j<off[s.u+1];j++)visit(arcs[j]);
            for(const auto a:extra[s.u])visit(a);
        }
        // Meeting Voronoi regions are sufficient to recover an MST of the
        // terminal shortest-path metric in each connected component.
        vector<std::tuple<double,u32,u32>> candidates;
        auto boundary=[&](u32 u,Arc a){int x=owner[u],y=owner[a.v];
            if(u<a.v && x>=0 && y>=0 && x!=y)candidates.emplace_back(d[u]+a.length+d[a.v],std::min(x,y),std::max(x,y));};
        for(u32 u=0;u<all;u++){if(u<n)for(auto j=off[u];j<off[u+1];j++)boundary(u,arcs[j]);
            for(auto a:extra[u])boundary(u,a);}
        // Sites without road access can share a physical location.
        std::map<std::array<int32_t,2>,u32> unserved;
        for(u32 j=0;j<ns;j++)if(tiers[j]==tier && stops[j].status==2){
            auto inserted=unserved.emplace(std::array<int32_t,2>{stops[j].p.x,stops[j].p.y},j);
            if(!inserted.second)candidates.emplace_back(0.,inserted.first->second,j);}
        std::sort(candidates.begin(),candidates.end());Groups groups(ns);
        for(auto [len,a,b]:candidates)if(groups.join(a,b))pairs.push_back({a,b});
    }
    u32 peerCount=u32(pairs.size())-np;write(out,peerCount);
    if(peerCount)out.write(reinterpret_cast<char*>(pairs.data()+np),peerCount*8);
    vector<double> cost(n);vector<u32> visited(n,0);vector<int> prev(n);
    for(u32 row=1;row<=pairs.size();row++){
        auto [from,to]=pairs[row-1];const Stop &a=stops.at(from),&b=stops.at(to);
        uint8_t code=0;float meters=0,access=0;vector<u32> path;
        if(a.status==1 || b.status==1)code=1;
        else if(a.p.x==b.p.x && a.p.y==b.p.y)code=4;
        else if(a.status || b.status)code=2;
        else if(component[a.u]!=component[b.u])code=3;
        else {
            access=dist(a.p,a.q)+dist(b.q,b.p);
            if(a.u==b.u && a.v==b.v)meters=access+dist(a.q,b.q);
            else {
                std::priority_queue<State> q;
                auto offer=[&](u32 v,int parent,double g){
                    if(visited[v]!=row || g<cost[v]){visited[v]=row;cost[v]=g;prev[v]=parent;q.push({g+dist(points[v],b.q),g,v});}};
                auto edgeCost=[&](const Stop&s){for(auto j=off[s.u];j<off[s.u+1];j++)if(arcs[j].v==u32(s.v)){
                    double d=dist(points[s.u],points[s.v]);return d?arcs[j].length/d:1.;}throw std::runtime_error("snap not on graph");};
                const double ca=edgeCost(a),cb=edgeCost(b);
                offer(a.u,-1,ca*dist(a.q,points[a.u]));offer(a.v,-1,ca*dist(a.q,points[a.v]));
                double best=std::numeric_limits<double>::infinity();int last=-1;
                while(!q.empty()){auto s=q.top();q.pop();if(s.f>=best)break;if(s.g!=cost[s.u])continue;
                    if(s.u==u32(b.u)||s.u==u32(b.v)){double g=s.g+cb*dist(points[s.u],b.q);if(g<best){best=g;last=s.u;}}
                    for(auto j=off[s.u];j<off[s.u+1];j++)offer(arcs[j].v,int(s.u),s.g+arcs[j].length);
                }
                if(last==-1)throw std::runtime_error("component path inconsistency");
                for(int v=last;v>=0;v=prev[v])path.push_back(v);
                std::reverse(path.begin(),path.end());Point p=a.q;double length=access;
                for(auto id:path){length+=dist(p,points[id]);p=points[id];}meters=length+dist(p,b.q);
            }
        }
        write(out,code);write(out,meters);write(out,access);write(out,u32(path.size()));
        if(path.size())out.write(reinterpret_cast<char*>(path.data()),4*path.size());
    }
    if(!out)throw std::runtime_error("output failed");
    return 0;
} catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}

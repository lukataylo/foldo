import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const COLORS = ['hsl(243 75% 59%)', 'hsl(190 90% 40%)', 'hsl(152 69% 36%)', 'hsl(32 95% 50%)', 'hsl(340 80% 55%)', 'hsl(220 9% 55%)'];
const axis = { fontSize: 12, fill: 'hsl(220 9% 40%)' };
const tip = { borderRadius: 8, border: '1px solid hsl(220 13% 91%)', fontSize: 12 };

/** <AreaTrend data={[{ label, value }]} format={(v) => money(v)} /> */
export function AreaTrend({ data, xKey = 'label', yKey = 'value', format = (v) => v, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.25} />
            <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="hsl(220 13% 91%)" />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={format} width={64} />
        <Tooltip contentStyle={tip} formatter={(v) => format(v)} />
        <Area type="monotone" dataKey={yKey} stroke={COLORS[0]} strokeWidth={2} fill="url(#trend)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** <BarCompare data={[{ label, a, b }]} series={[{ key: 'a', name: 'Us' }, { key: 'b', name: 'Banks' }]} /> */
export function BarCompare({ data, series, xKey = 'label', format = (v) => v, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="hsl(220 13% 91%)" />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={format} width={64} />
        <Tooltip contentStyle={tip} formatter={(v) => format(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** <Donut data={[{ name, value }]} /> */
export function Donut({ data, format = (v) => v, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={2} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tip} formatter={(v) => format(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

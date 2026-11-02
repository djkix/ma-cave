/** Tracés simplifiés de la France métropolitaine et des douze régions viticoles du référentiel,
 * projetés à la main (longitude, latitude) dans un viewBox `0 0 300 300`. Généré une fois, puis figé. */
export const FRANCE_OUTLINE = 'M146 24 136 27 132 33 131 42 132 48 122 55 108 60 103 67 105 69 96 73 81 70 77 62 70 63 64 61 67 71 71 85 73 91 66 90 63 90 49 94 43 87 36 86 25 88 10 95 10 99 18 101 15 103 11 107 18 114 27 112 37 116 42 123 49 122 53 128 59 128 61 133 58 137 64 144 67 150 79 159 82 165 82 174 79 175 78 191 77 201 77 208 76 213 74 228 71 233 67 236 78 244 91 252 101 255 130 260 139 262 155 261 161 262 159 259 159 255 159 249 161 242 167 238 171 235 176 232 180 232 185 234 193 235 203 238 206 241 214 244 218 245 227 239 229 235 234 231 239 227 244 225 246 216 232 208 229 193 232 184 232 172 233 162 230 152 225 152 217 157 217 147 224 137 233 128 234 122 245 120 245 112 246 106 249 92 257 82 252 79 242 76 235 77 229 76 222 68 212 66 202 63 193 59 193 49 185 54 180 53 179 45 171 43 163 32 150 31Z M280 246 283 257 282 271 276 291 268 286 264 277 264 266 271 256 278 255Z';

/**
 * `labelX`/`labelY` : nombre (et cercle tactile des petites régions). Le nom s'écrit au-dessus,
 * sauf `name` placé ailleurs (`anchor` : alignement du texte) là où la place manque.
 */
export const FRANCE_REGIONS: Array<{ name: string; d: string; labelX: number; labelY: number; nameAt?: { x: number; y: number; anchor: 'start' | 'middle' | 'end' } }> = [
  { name: 'Alsace', d: 'M242 82 247 88 246 103 243 117 237 117 237 103 239 92Z', labelX: 242, labelY: 100, nameAt: { x: 251, y: 103, anchor: 'start' } },
  { name: 'Beaujolais', d: 'M188 156 193 156 193 167 188 167Z', labelX: 190, labelY: 162, nameAt: { x: 183, y: 165, anchor: 'end' } },
  { name: 'Bordeaux', d: 'M81 176 90 180 99 190 105 195 102 205 93 208 88 202 84 188Z', labelX: 93, labelY: 192 },
  { name: 'Bourgogne', d: 'M169 110 179 108 186 119 197 126 196 139 195 148 193 155 188 155 188 143 188 133 181 125 170 119Z', labelX: 188, labelY: 130, nameAt: { x: 176, y: 116, anchor: 'middle' } },
  { name: 'Champagne', d: 'M166 70 183 68 187 81 190 100 188 110 179 108 175 95 168 83Z', labelX: 180, labelY: 88 },
  { name: 'Jura', d: 'M204 133 214 133 213 151 204 151Z', labelX: 209, labelY: 142, nameAt: { x: 219, y: 145, anchor: 'start' } },
  { name: 'Languedoc-Roussillon', d: 'M186 223 179 230 171 234 166 237 160 241 158 249 158 257 147 258 145 249 147 238 158 230 170 221 181 216Z', labelX: 156, labelY: 235, nameAt: { x: 146, y: 263, anchor: 'end' } },
  { name: 'Loire', d: 'M65 126 90 121 114 121 130 117 149 121 159 124 158 133 143 132 120 132 101 133 82 137 65 137Z', labelX: 112, labelY: 126 },
  { name: 'Provence', d: 'M196 226 208 225 221 229 233 230 227 237 217 243 204 237 195 233Z', labelX: 215, labelY: 233 },
  { name: 'Rhône', d: 'M189 176 195 176 195 191 200 205 199 219 189 223 187 210 190 191Z', labelX: 193, labelY: 199, nameAt: { x: 184, y: 203, anchor: 'end' } },
  { name: 'Savoie', d: 'M209 165 223 165 225 180 213 183 208 175Z', labelX: 216, labelY: 173, nameAt: { x: 229, y: 177, anchor: 'start' } },
  { name: 'Sud-Ouest', d: 'M107 192 132 199 143 219 132 235 111 241 86 242 76 235 90 221 95 210 105 206Z', labelX: 118, labelY: 221 },
];

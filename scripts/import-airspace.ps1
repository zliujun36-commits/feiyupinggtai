param([string]$Source = 'C:/Users/86181/Desktop/限飞区信息/限飞区.kml')
$ErrorActionPreference = 'Stop'
[xml]$xml = Get-Content -LiteralPath $Source -Raw -Encoding utf8
$ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
$ns.AddNamespace('k', 'http://www.opengis.net/kml/2.2')
$features = [Collections.Generic.List[object]]::new()
$counts = @{}
$vertices = 0
$index = 0
$bbox = @(180.0,90.0,-180.0,-90.0)
foreach ($placemark in $xml.SelectNodes('//k:Placemark', $ns)) {
  $index++
  $description = $placemark.SelectSingleNode('k:description', $ns).InnerText
  $levelMatch = [regex]::Match($description, '等级:\s*([^\r\n]+)')
  $idMatch = [regex]::Match($description, 'ID:\s*([^\r\n]+)')
  if (!$levelMatch.Success) { throw "Missing level at $index" }
  $level = $levelMatch.Groups[1].Value.Trim()
  $polygons = $placemark.SelectNodes('k:Polygon', $ns)
  if ($polygons.Count -ne 1) { throw "Unexpected geometry at $index" }
  $rings = [Collections.Generic.List[object]]::new()
  $bounds = @(180.0,90.0,-180.0,-90.0)
  foreach ($coordinates in $polygons[0].SelectNodes('k:outerBoundaryIs/k:LinearRing/k:coordinates | k:innerBoundaryIs/k:LinearRing/k:coordinates', $ns)) {
    $ring = [Collections.Generic.List[object]]::new()
    foreach ($position in ($coordinates.InnerText.Trim() -split '\s+')) {
      $values = $position.Split(',')
      $lng = [double]::Parse($values[0], [Globalization.CultureInfo]::InvariantCulture)
      $lat = [double]::Parse($values[1], [Globalization.CultureInfo]::InvariantCulture)
      if (![double]::IsFinite($lng) -or ![double]::IsFinite($lat) -or [math]::Abs($lng) -gt 180 -or [math]::Abs($lat) -gt 90) { throw "Invalid coordinate at $index" }
      $ring.Add([double[]]@($lng,$lat))
      $bounds[0] = [math]::Min($bounds[0],$lng); $bounds[1] = [math]::Min($bounds[1],$lat)
      $bounds[2] = [math]::Max($bounds[2],$lng); $bounds[3] = [math]::Max($bounds[3],$lat)
      $vertices++
    }
    if ($ring.Count -lt 4) { throw "Invalid ring at $index" }
    if ($ring[0][0] -ne $ring[$ring.Count-1][0] -or $ring[0][1] -ne $ring[$ring.Count-1][1]) { throw "Unclosed ring at $index" }
    $rings.Add($ring.ToArray())
  }
  if ($rings.Count -eq 0) { throw "Missing ring at $index" }
  $features.Add([ordered]@{
    type='Feature'; id="zone-$index"; bbox=$bounds
    properties=[ordered]@{name=$placemark.SelectSingleNode('k:name',$ns).InnerText; level=$level; sourceId=$idMatch.Groups[1].Value.Trim(); description=$description}
    geometry=[ordered]@{type='Polygon'; coordinates=$rings.ToArray()}
  })
  $counts[$level] = 1 + $counts[$level]
  $bbox[0]=[math]::Min($bbox[0],$bounds[0]); $bbox[1]=[math]::Min($bbox[1],$bounds[1]); $bbox[2]=[math]::Max($bbox[2],$bounds[2]); $bbox[3]=[math]::Max($bbox[3],$bounds[3])
}
$metadata = [ordered]@{
  sourceFile=[IO.Path]::GetFileName($Source)
  sourceDocument=$xml.kml.Document.name
  sourceDescription=$xml.kml.Document.description
  declaredSource='DJI FlySafe API'; generatedAt='2026-05-06'
  coordinateSystem='WGS 84 (EPSG:4326)'; sourceSha256=(Get-FileHash -LiteralPath $Source).Hash.ToLower()
  featureCount=$features.Count; vertexCount=$vertices; counts=$counts
  notes=@('文件声明的来源与生成日期，未经独立核验。','原文件含境外区域；全部保留，不以矩形范围裁切。','两个 KML 文件 SHA256 相同，只导入一份。','保留原始经纬度与多边形边界；KML 的 0 高程不作为限高值。')
}
$collection=[ordered]@{type='FeatureCollection';bbox=$bbox;metadata=$metadata;features=$features.ToArray()}
$destination=Join-Path $PSScriptRoot '../dist/data/airspace.geojson'
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
[IO.File]::WriteAllText($destination,($collection | ConvertTo-Json -Depth 30 -Compress),[Text.UTF8Encoding]::new($false))
$metadata | ConvertTo-Json -Depth 5

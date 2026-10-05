// Icon registry for tenant sites: service cards and the hero motif look icons
// up by kebab-case key, so presets and stored service rows stay plain strings.
import {
  Activity, Apple, Award, Baby, BadgeCheck, BedDouble, BookOpen, Boxes, BrickWall, Briefcase,
  Building, Building2, Calculator, CalendarCheck, Camera, Car, ChefHat, Cloud, Code, Coffee, Cog,
  Compass, ConciergeBell, Container, Cpu, Droplet, Droplets, Dumbbell, EggFried, Factory, FileText,
  Flame, FlaskConical, Flower2, Fuel, Gauge, Gem, Gift, Globe, GraduationCap, HardHat, Hammer,
  Headphones, Heart, HeartPulse, Hotel, House, Key, Lamp, Landmark, LayoutGrid, Leaf, Lightbulb,
  Luggage, Map, MapPin, Megaphone, MessageCircle, Mountain, Music, Package, Paintbrush, PartyPopper,
  PenTool, Pill, Pizza, Plane, Plug, Plus, QrCode, Recycle, Repeat, Route, Ruler, Scale, Scissors,
  ShieldCheck, Shield, ShoppingBag, Smartphone, Smile, Snowflake, Sofa, Sparkles, Sprout, Star,
  Stethoscope, Store, Sun, Tag, Ticket, Timer, Tractor, Trophy, Truck, Users, UtensilsCrossed,
  Video, Warehouse, Waves, Wheat, Wifi, Wrench, Zap, Clock,
} from "lucide-react";

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

export const SITE_ICONS: Record<string, IconComponent> = {
  activity: Activity, apple: Apple, award: Award, baby: Baby, "badge-check": BadgeCheck,
  "bed-double": BedDouble, "book-open": BookOpen, boxes: Boxes, "brick-wall": BrickWall,
  briefcase: Briefcase, building: Building, "building-2": Building2, calculator: Calculator,
  "calendar-check": CalendarCheck, camera: Camera, car: Car, "chef-hat": ChefHat, clock: Clock,
  cloud: Cloud, code: Code, coffee: Coffee, cog: Cog, compass: Compass,
  "concierge-bell": ConciergeBell, container: Container, cpu: Cpu, droplet: Droplet,
  droplets: Droplets, dumbbell: Dumbbell, "egg-fried": EggFried, factory: Factory,
  "file-text": FileText, flame: Flame, "flask-conical": FlaskConical, "flower-2": Flower2,
  fuel: Fuel, gauge: Gauge, gem: Gem, gift: Gift, globe: Globe, "graduation-cap": GraduationCap,
  "hard-hat": HardHat, hammer: Hammer, headphones: Headphones, heart: Heart,
  "heart-pulse": HeartPulse, hotel: Hotel, house: House, key: Key, lamp: Lamp, landmark: Landmark,
  "layout-grid": LayoutGrid, leaf: Leaf, lightbulb: Lightbulb, luggage: Luggage, map: Map,
  "map-pin": MapPin, megaphone: Megaphone, "message-circle": MessageCircle, mountain: Mountain,
  music: Music, package: Package, paintbrush: Paintbrush, "party-popper": PartyPopper,
  "pen-tool": PenTool, pill: Pill, pizza: Pizza, plane: Plane, plug: Plug, plus: Plus,
  "qr-code": QrCode, recycle: Recycle, repeat: Repeat, route: Route, ruler: Ruler, scale: Scale,
  scissors: Scissors, shield: Shield, "shield-check": ShieldCheck, "shopping-bag": ShoppingBag,
  smartphone: Smartphone, smile: Smile, snowflake: Snowflake, sofa: Sofa, sparkles: Sparkles,
  sprout: Sprout, star: Star, stethoscope: Stethoscope, store: Store, sun: Sun, tag: Tag,
  ticket: Ticket, timer: Timer, tractor: Tractor, trophy: Trophy, truck: Truck, users: Users,
  "utensils-crossed": UtensilsCrossed, video: Video, warehouse: Warehouse, waves: Waves,
  wheat: Wheat, wifi: Wifi, wrench: Wrench, zap: Zap,
};

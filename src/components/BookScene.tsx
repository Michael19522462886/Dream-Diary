import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";

interface BookSceneProps {
  motionKey: number;
}

function DustField() {
  const points = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const payload = new Float32Array(320 * 3);

    for (let index = 0; index < 320; index += 1) {
      const stride = index * 3;
      payload[stride] = (Math.random() - 0.5) * 10;
      payload[stride + 1] = Math.random() * 4 - 1;
      payload[stride + 2] = (Math.random() - 0.5) * 8;
    }

    return payload;
  }, []);

  useFrame(({ clock }) => {
    if (!points.current) {
      return;
    }

    points.current.rotation.y = clock.getElapsedTime() * 0.02;
    points.current.position.y = Math.sin(clock.getElapsedTime() * 0.45) * 0.06;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={positions.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffe9cd"
        size={0.035}
        transparent
        opacity={0.52}
        sizeAttenuation
      />
    </points>
  );
}

function FloatingBook({ motionKey }: BookSceneProps) {
  const book = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!book.current) {
      return;
    }

    const idle = clock.getElapsedTime();
    const motion = Math.sin(idle * 1.6 + motionKey) * 0.02;
    book.current.rotation.x = -0.23 + motion;
    book.current.rotation.y = -0.18 + Math.cos(idle * 0.9) * 0.025;
    book.current.position.y = -0.2 + Math.sin(idle * 0.6) * 0.08;
  });

  return (
    <Float speed={0.8} rotationIntensity={0.08} floatIntensity={0.12}>
      <group ref={book} position={[0, -0.2, 0]}>
        <mesh castShadow receiveShadow position={[0, -0.08, 0]}>
          <boxGeometry args={[3.8, 0.18, 2.7]} />
          <meshStandardMaterial color="#8c5f56" roughness={0.85} metalness={0.12} />
        </mesh>

        <mesh castShadow receiveShadow position={[-0.93, 0.02, 0]} rotation={[0, 0.15, 0]}>
          <boxGeometry args={[1.9, 0.04, 2.55]} />
          <meshStandardMaterial color="#f6eddc" roughness={0.92} />
        </mesh>

        <mesh castShadow receiveShadow position={[0.93, 0.02, 0]} rotation={[0, -0.15, 0]}>
          <boxGeometry args={[1.9, 0.04, 2.55]} />
          <meshStandardMaterial color="#fbf2e3" roughness={0.92} />
        </mesh>

        <mesh castShadow position={[0, 0.12, -1.18]}>
          <boxGeometry args={[3.6, 0.1, 0.16]} />
          <meshStandardMaterial color="#6e4051" roughness={0.6} metalness={0.16} />
        </mesh>
      </group>
    </Float>
  );
}

export function BookScene({ motionKey }: BookSceneProps) {
  return (
    <div className="scene-layer" aria-hidden="true">
      <Canvas camera={{ position: [0, 1.1, 7.6], fov: 42 }} shadows dpr={[1, 1.8]}>
        <color attach="background" args={["#1a1221"]} />
        <fog attach="fog" args={["#1a1221", 6, 14]} />

        <ambientLight intensity={1.3} color="#ffd6ef" />
        <directionalLight
          castShadow
          color="#fff5dd"
          intensity={2.3}
          position={[3.5, 4.6, 2.4]}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <spotLight
          color="#ffbf95"
          intensity={28}
          position={[-4, 5, 3]}
          angle={0.42}
          penumbra={0.85}
        />

        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]}>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#392230" roughness={0.96} />
        </mesh>

        <Stars radius={22} depth={14} count={1800} factor={2} saturation={0.5} fade />
        <DustField />
        <FloatingBook motionKey={motionKey} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.2} />
      </Canvas>
    </div>
  );
}
